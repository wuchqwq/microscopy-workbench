"""Temporary, exact-anchor review recipe; removed before merging the candidate."""
import hashlib
import importlib
import json
import os
from pathlib import Path
import sys
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'tests'))
from crystallography import twin_geometry as twin
from test_twin_geometry import measurement_rows, cases, REGISTRATION, INTERFACE

REPLACEMENT = '''def _independence(measurements, reciprocal_tolerance=.005):
    """Conservative finite-resolution admission, not floating-point rank.

    The declared reciprocal acceptance radius is a deterministic guard, NOT
    measured peak uncertainty. Connected ambiguity components may conservatively
    undercount directions, but near Friedel/harmonic jitter cannot add evidence.
    """
    _need(_finite(reciprocal_tolerance) and 1e-12 <= reciprocal_tolerance <= 1,
          "Direction admission needs the predeclared reciprocal tolerance")
    observations = [measurement_vector(row) for row in measurements]
    vectors = np.asarray([row["q_xy_inv_angstrom"] for row in observations], dtype=float)
    norms = [math.hypot(*vector) for vector in vectors]
    units = [vector / length for vector, length in zip(vectors, norms)]
    radii = [math.asin(min(1., reciprocal_tolerance / length)) for length in norms]
    resolved = [i for i, length in enumerate(norms) if length > reciprocal_tolerance]
    adjacent = {i: set() for i in resolved}
    pair_checks = []
    floor = math.radians(1.)
    for position, i in enumerate(resolved):
        for j in resolved[position+1:]:
            left, right = units[i], units[j]
            angle = math.atan2(abs(float(left[0]*right[1]-left[1]*right[0])),
                               abs(float(np.dot(left, right))))
            threshold = min(math.pi/2, max(floor, radii[i]+radii[j]))
            separated = angle > threshold + _ROUND_OFF
            if not separated:
                adjacent[i].add(j)
                adjacent[j].add(i)
            pair_checks.append({"measurement_indices": [i, j],
                                "line_angle_degrees": math.degrees(angle),
                                "required_separation_degrees": math.degrees(threshold),
                                "resolved_as_distinct": separated})
    unseen, families = set(resolved), []
    while unseen:
        seed = min(unseen, key=lambda i: observations[i]["measurement_object_id"])
        pending, members = [seed], set()
        while pending:
            i = pending.pop()
            if i in members:
                continue
            members.add(i)
            pending.extend(adjacent[i]-members)
        unseen -= members
        members = sorted(members, key=lambda i: observations[i]["measurement_object_id"])
        representative = units[members[0]].copy()
        if representative[0] < 0 or representative[0] == 0 and representative[1] < 0:
            representative = -representative
        families.append({"direction_xy_unit": representative.tolist(),
                         "measurement_object_ids": [observations[i]["measurement_object_id"] for i in members],
                         "family_semantics": "unresolved-direction component, not an indexed reflection identity"})
    singular = np.linalg.svd(vectors / np.max(np.abs(vectors)), compute_uv=False) if len(vectors) else []
    numerical_rank_two = bool(len(singular) == 2 and singular[1] > _ROUND_OFF * max(vectors.shape) * singular[0])
    return {"adequate": len(families) >= 2 and numerical_rank_two,
            "noncollinear_direction_family_count": len(families), "direction_families": families,
            "normalized_singular_values": list(map(float, singular)),
            "numerical_rank_two_diagnostic_only": numerical_rank_two,
            "direction_policy_version": "finite_reciprocal_direction_support_v2",
            "direction_admission": {
                "minimum_line_separation_degrees": 1.,
                "reciprocal_radius_inv_angstrom": float(reciprocal_tolerance),
                "angular_radius_formula": "asin(min(1,declared_reciprocal_tolerance/abs(q)))",
                "pair_threshold": "max(1 degree, sum of angular radii); strict separation",
                "policy_semantics": "deterministic conservative admission, not measured peak uncertainty or confidence",
                "family_grouping": "connected ambiguous-line components before candidate fitting"},
            "per_measurement_angular_radius_degrees": list(map(math.degrees, radii)),
            "unresolved_measurement_object_ids": [observations[i]["measurement_object_id"] for i in range(len(norms)) if i not in adjacent],
            "pairwise_direction_checks": pair_checks,
            "independence_scope": "Finite-resolution noncollinear reciprocal directions only; near Friedel/conjugate/harmonic jitter cannot create a direction; no held-out validation"}
'''


def once(text, before, after):
    if text.count(before) != 1:
        raise RuntimeError('Unexpected integration anchor: ' + before[:100])
    return text.replace(before, after, 1)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def noisy_comparison():
    a, b, parent, child = cases()
    def jitter(data, prefix):
        q = np.array(data[1]['physical_vector_xy'])
        return measurement_rows([q, -q + np.array([1e-6, -1e-6])], prefix, friedel=False)
    return twin.evaluate(jitter(a, 1), jitter(b, 2), parent, child,
                         REGISTRATION, .005, interface=INTERFACE)


def main():
    target = ROOT / 'crystallography/twin_geometry.py'
    raw = target.read_bytes()
    blob = hashlib.sha1(b'blob ' + str(len(raw)).encode() + b'\0' + raw).hexdigest()
    if blob != '66f329b21528b4ac6a8c5bfe3530df852cc50327':
        raise RuntimeError('Source geometry differs from reviewed PR42')
    q = [[.4, .2], [-.400001, -.199999]]
    data = measurement_rows(q, friedel=False)
    before = twin._independence(data)
    before_full = noisy_comparison()
    assert before['adequate'] is True and before['noncollinear_direction_family_count'] == 2
    assert before_full['status'] == 'compatible'
    text = raw.decode('utf-8')
    start, end = text.index('def _independence(measurements):'), text.index('\ndef _ambiguous(comparison):')
    text = text[:start] + REPLACEMENT + '\n' + text[end:]
    text = once(text, '_independence(measurements_a), _independence(measurements_b)',
                '_independence(measurements_a, tolerance), _independence(measurements_b, tolerance)')
    target.write_text(text, encoding='utf-8')
    importlib.invalidate_caches()
    importlib.reload(twin)
    after = twin._independence(data)
    after_full = noisy_comparison()
    assert after['adequate'] is False and after['noncollinear_direction_family_count'] == 1
    assert after_full['status'] == 'insufficient_evidence'
    assert twin.evaluate(*cases(), REGISTRATION, .005, interface=INTERFACE)['status'] == 'compatible'

    old_root = Path(os.environ['F3B_BASELINE_WORKSPACE'])
    hashes = {str(p.relative_to(old_root)): digest(p) for p in old_root.rglob('*') if p.is_file()}
    from crystallography import structure_tools as provider
    recovered = []
    for path in old_root.rglob('object.json'):
        metadata = json.loads(path.read_text(encoding='utf-8'))
        if metadata.get('kind') != 'twin_compare':
            continue
        workspace = path.parent.parent.parent
        assert 'direction_policy_version' not in metadata['projected_relation']['domain_a_geometry']
        read = provider.execute({'action': 'get', 'workspace': str(workspace), 'object_id': metadata['object_id']})
        replay = provider.execute({'action': 'result', 'workspace': str(workspace), 'query_request_id': metadata['request_id']})
        assert read['ok'] and replay['ok'] and read == replay
        assert read['projected_relation'] == metadata['projected_relation']
        recovered.append(metadata['object_id'])
    assert len(recovered) == 2
    assert hashes == {str(p.relative_to(old_root)): digest(p) for p in old_root.rglob('*') if p.is_file()}
    report = {'status': 'PASS_LIMITED_REVIEW_SCOPE', 'reviewed_source_head': '05e7270',
              'test_input_q_inv_angstrom': q, 'before': before, 'after': after,
              'noisy_one_family_comparison_before': before_full['status'],
              'noisy_one_family_comparison_after': after_full['status'],
              'positive_multifamily_comparison': 'compatible',
              'original_method_version': 'f3b_cubic_sigma3_v1',
              'new_direction_policy_version': after['direction_policy_version'],
              'historical_provider_objects_recovered': len(recovered),
              'historical_files_preserved': len(hashes),
              'source_sha256_before': hashlib.sha256(raw).hexdigest(),
              'source_sha256_after': digest(target),
              'source_arrays_or_fft_recomputed_by_review': False,
              'scope': 'Analytic direction admission plus exact original-request recovery of actual Linux pre-fix MCP results; not real specimens'}
    output = ROOT / 'docs/validation/f3b/direction-review.json'
    output.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False)+'\n', encoding='utf-8')

    method = ROOT / 'docs/PROJECTED_TWIN_EVIDENCE.md'
    method.write_text(method.read_text(encoding='utf-8') + '''
## Finite directional resolution after PR42 review

New comparisons identify the direction admission policy as
`finite_reciprocal_direction_support_v2`. Numerical matrix rank alone cannot
make jittered Friedel partners or nearly parallel harmonics independent.
For each nonzero measured q, use the predeclared reciprocal acceptance radius
r to construct an angular guard asin(min(1,r/|q|)). Unoriented directions must
be separated by more than max(1 degree, the sum of both angular guards).
Vectors whose radius reaches DC remain unresolved. Connected ambiguity groups
are order/sign independent and may conservatively undercount directions;
these are not assigned crystallographic reflection identities.

This is an explicit deterministic admission policy, NOT an independently
measured peak uncertainty, calibrated confidence or a change to reflection
matching tolerances. Known larger localisation/calibration errors still need
appropriate experimental bounds; the one-degree floor cannot be removed by
choosing an unrealistically small matching tolerance. The interface angular
criterion remains a separate, unchanged quantity. Every observation and
pairwise direction check remains visible; no artificial averaging is used.

The candidate-law `method_version` remains v1 because its matrix/simulation
model is unchanged. New numerical reports carry the new direction-policy ID.
Old committed reports without it remain historical and are returned byte-for-byte
through original-request recovery, not reclassified. Make an explicit new
comparison/revision to apply the corrected admission. See the exact RED/GREEN
[review evidence](validation/f3b/direction-review.json).

The independent read-only `F3b actual simulation` workflow runs the actual
pinned diffsims provider and compiled MCP smoke on Ubuntu, in addition to the
ordinary lightweight geometry/source tests. It archives its exact public
source, resolved environment and synthetic output for 14 days. Documentation
edits alone do not request this optional integration workflow.
''', encoding='utf-8')

    chinese = ROOT / 'README.zh-CN.md'
    old = '**下一阶段**：F3b 晶体学孪晶关系与界面证据，之后再开展更完整的跨方法主动分析 F4-full。参见[科研路线 #16](https://github.com/wuchqwq/microscopy-workbench/issues/16)。当前不开展 Encoder、基础模型训练或实时显微镜控制。'
    new = '**F3b 首版**：[有限范围的 Σ3 候选与投影界面证据](docs/PROJECTED_TWIN_EVIDENCE.md)复用相邻 ROI 的已保存 FFT 观测和实际模拟反射，分别保留相容、不相容及证据不足，不认定唯一三维孪晶或原子相干界。下一阶段是 F4-full 的最小跨方法分析闭环；参见[科研路线 #16](https://github.com/wuchqwq/microscopy-workbench/issues/16)。当前不开展 Encoder、基础模型训练或实时显微镜控制。'
    chinese.write_text(once(chinese.read_text(encoding='utf-8'), old, new), encoding='utf-8')
    print(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False))


if __name__ == '__main__':
    main()
