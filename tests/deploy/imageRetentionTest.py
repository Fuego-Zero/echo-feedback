# -*- coding: utf-8 -*-
"""镜像保留规则和删除前保护检查，不连接 Docker。"""
from __future__ import print_function

import imp
import os
import sys
import types
import unittest

if os.name == 'nt':
    sys.modules['fcntl'] = types.ModuleType('fcntl')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
retention = imp.load_source('echo_retention', os.path.join(ROOT, 'scripts', 'echoImageRetention.py'))


def image(key, day, tags=None):
    return {'id': key, 'created': '2026-10-%02dT00:00:00Z' % day,
            'tags': tags or ['echo-feedback:0.1.%s' % day], 'digests': []}


def container(key='live', image_id='current'):
    return {'id': key, 'image': image_id, 'running': True, 'health': 'healthy',
            'started': '2026-10-20T00:00:00Z', 'project': 'echo-feedback',
            'working_dir': '/data/echo-feedback'}


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.images = {x['id']: x for x in [image('old', 10), image('previous', 11),
                                          image('current', 12), image('pending', 13)]}
        self.current = container()
        self.state = {'current': 'previous', 'rollback': 'old'}

    def plan(self, containers=None, state=None):
        return retention.plan_retention(self.images, containers or [self.current],
                                        self.current, self.state if state is None else state)

    def test_keeps_current_and_previous_success(self):
        plan = self.plan()
        self.assertEqual((plan['current'], plan['rollback']), ('current', 'previous'))
        self.assertEqual([x['id'] for x in plan['candidates']], ['old'])
        self.assertIn(('pending', 'newer image may belong to a pending deployment'), plan['protected'])

    def test_repeated_run_preserves_previous(self):
        self.assertEqual(self.plan(state={'current': 'current', 'rollback': 'previous'})['rollback'],
                         'previous')

    def test_rollback_preserves_version_just_left(self):
        self.current['image'] = 'previous'
        self.assertEqual(self.plan(state={'current': 'current', 'rollback': 'previous'})['rollback'],
                         'current')

    def test_missing_success_history_refuses_cleanup(self):
        with self.assertRaises(retention.Deferred):
            self.plan(state={})

    def test_other_container_reference_protected(self):
        plan = self.plan([self.current, container('stopped-container', 'old')])
        self.assertEqual(plan['candidates'], [])

    def test_other_repository_tag_protected(self):
        self.images['old']['tags'].append('timenote:0.1.0')
        self.assertEqual(self.plan()['candidates'], [])

    def test_other_repository_digest_protected(self):
        self.images['old']['digests'] = ['ghcr.io/fuego-zero/timenote@sha256:abc']
        self.assertEqual(self.plan()['candidates'], [])

    def test_unrelated_and_untagged_images_ignored(self):
        self.images['foreign'] = image('foreign', 1, ['timenote:0.1.0'])
        self.images['untagged'] = image('untagged', 1)
        self.images['untagged']['tags'] = []
        self.assertEqual([x['id'] for x in self.plan()['candidates']], ['old'])

    def test_sha_and_version_tags_both_managed(self):
        self.assertTrue(retention.managed_tag('ghcr.io/fuego-zero/echo-feedback:sha-abc'))
        self.assertTrue(retention.managed_tag('echo-feedback:0.1.0'))
        self.assertFalse(retention.managed_tag('echo-feedback-api:0.1.0'))

    def test_health_and_deployment_identity_required(self):
        now = retention.epoch('2026-10-30T00:00:00Z')
        for field, value in [('running', False), ('health', 'unhealthy'),
                             ('project', 'timenote'), ('working_dir', '/data/Timenote'),
                             ('started', '2026-10-29T23:59:00Z')]:
            current = container()
            current[field] = value
            with self.assertRaises(retention.Deferred):
                retention.validate_container(current, now)

    def test_delete_rechecks_and_never_forces_or_prunes(self):
        owner = self
        commands = []

        class Docker(object):
            def current(self):
                return owner.current

            def images(self):
                return owner.images

            def containers(self):
                return [owner.current]

            def run(self, args):
                commands.append(args)
                del owner.images['old']
                return ''

        plan = self.plan()
        removed = retention.remove_candidates(Docker(), plan, self.current,
            now_fn=lambda: retention.epoch('2026-10-30T00:00:00Z'), quiet=lambda *args: None)
        self.assertEqual(removed, 1)
        self.assertEqual(commands, [['image', 'rm', '--no-prune', 'echo-feedback:0.1.10']])

    def test_changed_deployment_aborts_before_delete(self):
        owner = self

        class Docker(object):
            def current(self):
                return container('new-container')

        with self.assertRaises(retention.Deferred):
            retention.remove_candidates(Docker(), self.plan(), owner.current,
                now_fn=lambda: retention.epoch('2026-10-30T00:00:00Z'), quiet=lambda *args: None)


if __name__ == '__main__':
    unittest.main()
