#!/usr/bin/python
# -*- coding: utf-8 -*-
"""保留回声当前健康版本和上一成功版本。

兼容 DC6 的 Python 2.7，仅使用标准库。
默认只预览，只有 --apply 才删除镜像标签并更新保留状态。
"""
from __future__ import print_function

import argparse
import calendar
import datetime
import errno
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
import time

REPOSITORIES = ('ghcr.io/fuego-zero/echo-feedback', 'echo-feedback')
CONTAINER = 'echo-feedback-echo-1'
STATE_DIR = '/var/lib/echo-feedback-image-retention'
STATE_PATH = STATE_DIR + '/state.json'
LOCK_PATH = '/run/lock/echo-feedback-image-retention.lock'
DEPLOY_LOCK_PATH = '/data/echo-feedback/.deploy.lock'
STABLE_SECONDS = 300


class Deferred(Exception):
    pass


def managed_tag(tag):
    return ':' in tag and tag.rsplit(':', 1)[0] in REPOSITORIES


def managed_image(image):
    return any(managed_tag(t) for t in (image.get('tags') or []))


def exclusive_image(image):
    tags = image.get('tags') or []
    digests = image.get('digests') or []
    return bool(tags) and all(managed_tag(t) for t in tags) and all(
        d.split('@', 1)[0] in REPOSITORIES for d in digests)


def epoch(value):
    # Docker 时间戳可能包含纳秒和时区偏移。
    base = value[:19]
    result = calendar.timegm(datetime.datetime.strptime(base, '%Y-%m-%dT%H:%M:%S').timetuple())
    offset = re.search(r'([+-])(\d{2}):(\d{2})$', value)
    if offset:
        seconds = int(offset.group(2)) * 3600 + int(offset.group(3)) * 60
        result -= seconds if offset.group(1) == '+' else -seconds
    elif not value.endswith('Z'):
        raise ValueError('Docker timestamp has no recognized timezone')
    return result


def deployment_key(container):
    return (container['id'], container['image'], container['started'])


def validate_container(container, now):
    if not container['running'] or container['health'] != 'healthy':
        raise Deferred('回声 is not healthy and running')
    if container['project'] != 'echo-feedback' or container['working_dir'] != '/data/echo-feedback':
        raise Deferred('回声 deployment identity does not match')
    if now - epoch(container['started']) < STABLE_SECONDS:
        raise Deferred('Waiting for five minutes of running time')


def plan_retention(images, containers, current, state):
    family = {key: image for key, image in images.items() if managed_image(image)}
    live = current['image']
    if live not in family:
        raise Deferred('Current image has no recognized 回声 tag')
    previous = state.get('current')
    rollback = None
    if previous in family and previous != live:
        # 回滚后仍保留刚离开的成功版本，不按镜像构建时间推断成功与否。
        rollback = previous
    elif state.get('rollback') in family and state.get('rollback') != live:
        rollback = state['rollback']
    else:
        raise Deferred('No known previous successful image; initialize retention state first')
    keep = set([live, rollback]) - set([None])
    referenced = set(x['image'] for x in containers)
    previously_retained = set([state.get('current'), state.get('rollback')]) - set([None])
    candidates = []
    protected = []
    for image_id, image in sorted(family.items()):
        if image_id in keep:
            continue
        if image_id in referenced:
            protected.append((image_id, 'referenced by a container'))
        elif not exclusive_image(image):
            protected.append((image_id, 'also referenced by another repository'))
        elif (epoch(image['created']) > epoch(family[live]['created']) and
              image_id not in previously_retained):
            protected.append((image_id, 'newer image may belong to a pending deployment'))
        else:
            candidates.append(image)
    return {'current': live, 'rollback': rollback, 'candidates': candidates,
            'protected': protected}


class Docker(object):
    def run(self, args):
        command = ['/usr/bin/docker', '--config', STATE_DIR + '/docker-config',
                   '--host', 'unix:///var/run/docker.sock'] + args
        try:
            return subprocess.check_output(command, stderr=subprocess.STDOUT).decode('utf-8').strip()
        except subprocess.CalledProcessError as exc:
            raise RuntimeError('Docker command failed: ' + exc.output.decode('utf-8', 'replace').strip())

    def current(self):
        fmt = ('{"id":{{json .Id}},"image":{{json .Image}},'
               '"running":{{json .State.Running}},"started":{{json .State.StartedAt}},'
               '"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}},'
               '"project":{{json (index .Config.Labels "com.docker.compose.project")}},'
               '"working_dir":{{json (index .Config.Labels "com.docker.compose.project.working_dir")}}}')
        return json.loads(self.run(['container', 'inspect', '--format', fmt, CONTAINER]))

    def images(self):
        ids = sorted(set(self.run(['image', 'ls', '-aq', '--no-trunc']).splitlines()))
        if not ids:
            return {}
        fmt = ('{"id":{{json .Id}},"tags":{{json .RepoTags}},'
               '"digests":{{json .RepoDigests}},"created":{{json .Created}}}')
        return {x['id']: x for x in [json.loads(line) for line in
                self.run(['image', 'inspect', '--format', fmt] + ids).splitlines()]}

    def containers(self):
        ids = self.run(['container', 'ls', '-aq', '--no-trunc']).splitlines()
        if not ids:
            return []
        fmt = '{"id":{{json .Id}},"image":{{json .Image}}}'
        return [json.loads(line) for line in self.run(
            ['container', 'inspect', '--format', fmt] + ids).splitlines()]

    def recent_activity(self, now, container_id):
        fmt = ('{"type":{{json .Type}},"action":{{json .Action}},'
               '"id":{{json .Actor.ID}},"name":{{json (index .Actor.Attributes "name")}}}')
        events = self.run(['events', '--since', str(int(now) - STABLE_SECONDS),
                           '--until', str(int(now)), '--filter', 'event=pull',
                           '--filter', 'event=tag', '--filter', 'event=load',
                           '--filter', 'event=import', '--filter', 'event=health_status',
                           '--format', fmt])
        for line in events.splitlines():
            event = json.loads(line)
            if (event['type'] == 'container' and event['id'] == container_id and
                    event['action'].startswith('health_status')):
                return True
            name = event.get('name') or ''
            repo = name.split('@', 1)[0].rsplit(':', 1)[0]
            if (event['type'] == 'image' and event['action'] in ('pull', 'tag', 'load', 'import')
                    and repo in REPOSITORIES):
                return True
        return False


def docker_operation_active():
    mutations = set(['pull', 'tag', 'load', 'import', 'build', 'run', 'create',
                     'up', 'down', 'start', 'stop', 'restart', 'rm', 'rmi', 'prune'])
    for pid in os.listdir('/proc'):
        if not pid.isdigit():
            continue
        try:
            exe = os.path.basename(os.readlink('/proc/' + pid + '/exe')).replace(' (deleted)', '')
            if exe not in ('docker', 'docker-compose', 'docker-buildx'):
                continue
            with open('/proc/' + pid + '/cmdline', 'rb') as stream:
                args = stream.read().decode('utf-8', 'replace').split('\0')
            if mutations.intersection(args[1:]):
                return True
        except (IOError, OSError):
            continue
    return False


def ensure_quiet(docker, now, current):
    if docker_operation_active():
        raise Deferred('Another Docker deployment or mutation is active')
    if docker.recent_activity(now, current['id']):
        raise Deferred('Recent 回声 deployment or health transition; waiting five minutes')


def remove_candidates(docker, plan, expected, now_fn=time.time, quiet=ensure_quiet):
    deleted = 0
    for candidate in plan['candidates']:
        # 每次删除前重新检查部署、全部容器引用和标签；不用强制删除或全局清理。
        for tag in sorted(candidate['tags']):
            now = now_fn()
            fresh = docker.current()
            validate_container(fresh, now)
            if deployment_key(fresh) != deployment_key(expected):
                raise Deferred('Deployment changed during cleanup')
            quiet(docker, now, fresh)
            current_images = docker.images()
            image = current_images.get(candidate['id'])
            if image is None:
                break
            if not exclusive_image(image) or tag not in image['tags']:
                raise Deferred('Candidate tags changed during cleanup')
            if any(x['image'] == image['id'] for x in docker.containers()):
                raise Deferred('Candidate became referenced by a container')
            if set(image['tags']) - set(candidate['tags']):
                raise Deferred('Candidate gained new tags during cleanup')
            print('REMOVE ' + tag + ' image=' + image['id'][:19])
            sys.stdout.flush()
            result = docker.run(['image', 'rm', '--no-prune', tag])
            if result:
                print(result)
        if candidate['id'] in docker.images():
            raise RuntimeError('Candidate image was not completely removed')
        deleted += 1
    return deleted


def read_state():
    if not os.path.exists(STATE_PATH):
        return {}
    with open(STATE_PATH) as stream:
        state = json.load(stream)
    if not isinstance(state, dict) or state.get('schema') != 1:
        raise RuntimeError('Unexpected retention state; refusing cleanup')
    return state


def write_state(state):
    if not os.path.isdir(STATE_DIR):
        os.makedirs(STATE_DIR, 0o700)
    fd, path = tempfile.mkstemp(prefix='.state.', dir=STATE_DIR)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(state, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.rename(path, STATE_PATH)
    finally:
        if os.path.exists(path):
            os.unlink(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='enable scoped image removal and state updates')
    args = parser.parse_args()
    lock = None
    deploy_lock = None
    try:
        if args.apply:
            deploy_lock = open(DEPLOY_LOCK_PATH, 'a')
            try:
                fcntl.flock(deploy_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except IOError as exc:
                if exc.errno in (errno.EACCES, errno.EAGAIN):
                    raise Deferred('Echo deployment is active')
                raise
            lock = open(LOCK_PATH, 'a')
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except IOError as exc:
                if exc.errno in (errno.EACCES, errno.EAGAIN):
                    raise Deferred('Another retention run is active')
                raise
        docker = Docker()
        state = read_state()
        current = docker.current()
        now = time.time()
        validate_container(current, now)
        if args.apply and state.get('processed_deployment') == list(deployment_key(current)):
            print('SKIP deployment already processed')
            return 0
        ensure_quiet(docker, now, current)
        plan = plan_retention(docker.images(), docker.containers(), current, state)
        print('KEEP current=' + plan['current'] + ' rollback=' + str(plan['rollback']))
        print('PLAN old_images=%d protected=%d mode=%s' % (
            len(plan['candidates']), len(plan['protected']), 'apply' if args.apply else 'preview'))
        for image in plan['candidates']:
            print('CANDIDATE ' + image['id'] + ' tags=' + ','.join(sorted(image['tags'])))
        for image_id, reason in plan['protected']:
            print('PROTECT ' + image_id + ' reason=' + reason)
        if not args.apply:
            return 0
        removed = remove_candidates(docker, plan, current)
        fresh = docker.current()
        validate_container(fresh, time.time())
        if deployment_key(fresh) != deployment_key(current):
            raise Deferred('Deployment changed; retention state was not advanced')
        write_state({'schema': 1, 'current': plan['current'], 'rollback': plan['rollback'],
                     'processed_deployment': list(deployment_key(current)),
                     'updated_at': datetime.datetime.utcnow().isoformat() + 'Z'})
        print('DONE removed_images=%d' % removed)
        return 0
    except Deferred as exc:
        print('SKIP ' + str(exc))
        return 0
    except Exception as exc:
        print('ERROR ' + str(exc), file=sys.stderr)
        return 1
    finally:
        if lock is not None:
            lock.close()
        if deploy_lock is not None:
            deploy_lock.close()


if __name__ == '__main__':
    sys.exit(main())
