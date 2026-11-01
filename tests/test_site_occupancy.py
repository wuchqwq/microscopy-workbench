"""Independent site-fraction, actual ASE/diffsims and saved-chain regressions.

Set MICROSCOPY_OCCUPANCY_OUTPUT to a fresh directory to retain every request,
response, source and scientific-file hash. No experimental specimens are used.
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from ase import Atoms

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from crystallography import structure_tools as st, occupancy as occ, twin_geometry
from tools.crystal_qualification import qualify_structure


def xyz(values=(1, .5), alias='occupancy:R:1', extra=''):
    rows = [f'Cu {1.8*i} 0 0 {v}' for i, v in enumerate(values)]
    return f'{len(rows)}\nLattice="3.6 0 0 0 3.6 0 0 0 3.6" Properties=species:S:1:pos:R:3:{alias} pbc="T T T" {extra}\n'+'\n'.join(rows)+'\n'


class SiteOccupancy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        output = os.environ.get('MICROSCOPY_OCCUPANCY_OUTPUT')
        cls.temp = None if output else tempfile.TemporaryDirectory()
        cls.root = Path(output or cls.temp.name).resolve()
        if output: cls.root.mkdir(parents=True, exist_ok=False)
        cls.records = []

    @classmethod
    def tearDownClass(cls):
        files = {str(p.relative_to(cls.root)):hashlib.sha256(p.read_bytes()).hexdigest()
                 for p in cls.root.rglob('*') if p.is_file()}
        (cls.root/'execution.json').write_text(json.dumps(dict(calls=cls.records, files_sha256=files), indent=2)+'\n')
        if cls.temp: cls.temp.cleanup()

    def setUp(self):
        self.root = type(self).root/self._testMethodName
        self.root.mkdir()
        self.workspace = self.root/'workspace'
        self.serial = 0

    def call(self, action, expect=True, **kwargs):
        self.serial += 1
        request = dict(action=action, workspace=str(self.workspace), request_id=f'occupancy-{self.serial}', **kwargs)
        if action in ('get', 'result'): request.pop('request_id')
        result = st.execute(request)
        self.records.append(dict(case=self._testMethodName, request=request, response=result))
        self.assertEqual(result.get('ok'), expect, result)
        return result['result'] if expect else result

    def open(self, name, content):
        source = self.root/name;source.write_text(content)
        return self.call('open', source_path=str(source))

    def snapshot(self, object_id):
        return self.call('get', object_id=object_id, include_atoms=True)['atoms']

    def simulate(self, object_id, expect=True, **kw):
        return self.call('simulate', expect=expect, object_id=object_id, voltage_kv=200,
                         reciprocal_radius_inv_angstrom=.8, max_excitation_error_inv_angstrom=.02,
                         euler_rzxz_deg=[0,0,0], size=64, **kw)

    def test_partial_roundtrip_repeat_and_simulation_refusal(self):
        saved = self.open('partial.xyz', xyz())
        data = self.snapshot(saved['object_id'])
        self.assertEqual(data['atom_model_version'], 2)
        self.assertEqual(data['occupancy'], {'0':{'Cu':1.},'1':{'Cu':.5}})
        self.assertEqual(st.atoms_data(st.from_data(data)), data)
        child = self.call('derive', object_id=saved['object_id'], repeat=[2,1,1], rotation_deg_xyz=[0,0,90])
        repeated = self.snapshot(child['object_id'])
        self.assertEqual([r['Cu'] for r in repeated['occupancy'].values()], [1,.5,1,.5])
        self.assertEqual(repeated['occupancy_model'], data['occupancy_model'])
        for model in (saved, child):
            result = self.simulate(model['object_id'], expect=False)
            self.assertEqual(result['error']['code'], 'UNQUALIFIED_OCCUPANCY')
        self.assertFalse(any(json.loads(p.read_text()).get('kind') == 'simulate' for p in self.workspace.glob('objects/*/object.json')))

    def test_full_saved_chain_executes_actual_diffsims_and_retains_extinction(self):
        saved = self.open('full.xyz', xyz((1,1)))
        data = self.snapshot(saved['object_id'])
        self.assertEqual(data['occupancy_model']['source_channels'], ['occupancy_array'])
        sim = self.simulate(saved['object_id'])
        self.assertEqual(sim['software_provenance']['diffsims'], '0.7.0')
        self.assertTrue(sim['occupancy_admission']['qualified_ordered_model'])
        hkls = sim['reflections']['hkl']
        self.assertNotIn([1,0,0], hkls);self.assertIn([2,0,0], hkls)
        self.assertEqual(self.snapshot(saved['object_id']), data)

    def test_actual_library_matches_independent_two_site_basis_sum(self):
        from diffpy.structure import Atom, Lattice, Structure
        from diffsims.utils.sim_utils import get_kinematical_intensities
        hkls = np.array([[1,0,0],[2,0,0]])
        q = np.array([1/3.6,2/3.6]);lattice = Lattice(3.6,3.6,3.6,90,90,90)
        single = Structure([Atom('Cu',[0,0,0],occupancy=1)], lattice=lattice)
        denominator = get_kinematical_intensities(single,hkls,q)
        for fraction, truth in ((.5,[.25,2.25]), (1.,[0.,4.])):
            model = Structure([Atom('Cu',[0,0,0],occupancy=1),Atom('Cu',[.5,0,0],occupancy=fraction)], lattice=lattice)
            ratio = get_kinematical_intensities(model,hkls,q)/denominator
            np.testing.assert_allclose(ratio, truth, rtol=0, atol=1e-12)

    def test_public_fcc_twin_positive_and_partial_negative(self):
        positions = [(0,0,0),(0,1.8,1.8),(1.8,0,1.8),(1.8,1.8,0)]
        for fraction in (1., .5):
            body = '4\nLattice="3.6 0 0 0 3.6 0 0 0 3.6" Properties=species:S:1:pos:R:3:occupancy:R:1 pbc="T T T"\n'
            body += ''.join(f'Cu {x} {y} {z} {fraction if i==3 else 1}\n' for i,(x,y,z) in enumerate(positions))
            saved = self.open(f'fcc-{fraction}.xyz', body)
            orientation = self.call('orient', object_id=saved['object_id'], zone_axis_uvw=[1,1,1], in_plane_direction_uvw=[1,-1,0])
            twin = self.call('twin_orient', expect=fraction==1, object_id=saved['object_id'], orientation_id=orientation['object_id'],
                             plane_hkl=[1,1,1], candidate_basis='Analytic supplied conventional FCC test, not experimental identification')
            if fraction==1:
                sim = self.call('simulate', object_id=saved['object_id'], orientation_id=twin['object_id'], voltage_kv=200,
                                reciprocal_radius_inv_angstrom=.8, max_excitation_error_inv_angstrom=.02,size=64)
                self.assertTrue(sim['occupancy_admission']['qualified_ordered_model'])
            else: self.assertEqual(twin['error']['code'], 'UNSUPPORTED_TWIN_SCOPE')

    def test_aliases_conflicts_bool_unknown_and_wrong_species_do_not_become_full(self):
        good = self.open('alias.xyz', xyz(alias='occupancies:R:1'))
        self.assertEqual(self.snapshot(good['object_id'])['occupancy']['1'], {'Cu':.5})
        same = self.open('same.xyz', xyz(('1 1','.5 .5'), 'occupancy:R:1:occupancies:R:1'))
        self.assertEqual(self.snapshot(same['object_id'])['occupancy']['1'], {'Cu':.5})
        negatives = [xyz(('1 1','.5 1'),'occupancy:R:1:occupancies:R:1'), xyz(('T','T'),'occupancy:L:1'),
                     xyz(('?','?'),'occupancy:S:1'),xyz((1,1.01)), xyz((1,-.1)), xyz((1,'nan')),
                     xyz(extra="occupancy='_JSON {\"0\":{\"Cu\":1},\"1\":{\"Cu\":1}}'"),
                     xyz(extra="occupancy='_JSON {\"0\":{\"Ni\":1},\"1\":{\"Ni\":0.5}}'")]
        for i, text in enumerate(negatives):
            p=self.root/f'bad-{i}.xyz';p.write_text(text)
            result=self.call('open',expect=False,source_path=str(p));self.assertEqual(result['error']['code'],'INVALID_OCCUPANCY')

    def test_kind_mapping_mixed_sites_and_unmapped_info_are_explicit(self):
        atoms = Atoms('Cu3', positions=np.zeros((3,3)), cell=np.eye(3),pbc=True)
        atoms.info['occupancy']={'2':{'Cu':.25},'7':{'Cu':.75}}
        atoms.new_array('spacegroup_kinds',np.array([7,2,7]))
        occ.initialize(atoms);data=st.atoms_data(atoms)
        self.assertEqual([r['Cu'] for r in data['occupancy'].values()],[.75,.25,.75])
        self.assertEqual(st.atoms_data(st.from_data(data)),data)
        atoms=Atoms('Cu',positions=[[0,0,0]])
        atoms.info['occupancy']={'0':{'Cu':.5,'Ni':.5}}
        occ.initialize(atoms);self.assertFalse(occ.assessment(atoms)['qualified_ordered_model'])
        self.assertEqual(st.atoms_data(st.from_data(st.atoms_data(atoms))),st.atoms_data(atoms))
        with self.assertRaises(occ.OccupancyError):occ.require_full(atoms)
        atoms.info['occupancy']['9']={'Cu':1}
        with self.assertRaises(occ.OccupancyError):occ.normalize(atoms)

    def test_unknown_versions_legacy_serialization_and_current_qualification(self):
        legacy={'symbols':['Cu'],'positions_angstrom':[[0,0,0]],'cell_angstrom':np.eye(3).tolist(),
                'pbc':[True]*3,'occupancy':None}
        old=st.from_data(legacy);self.assertEqual(st.atoms_data(old),legacy)
        with self.assertRaises(occ.OccupancyError):occ.require_full(old)
        self.assertTrue(qualify_structure(old,policy_version=1)['occupancy']['qualified_ordered_model'])
        self.assertFalse(qualify_structure(old)['occupancy']['qualified_ordered_model'])
        for version in (None,True,1,3,'2'):
            with self.assertRaises(occ.OccupancyError):st.from_data({**legacy,'atom_model_version':version})
        new=Atoms('Cu',positions=[[0,0,0]]);occ.initialize(new)
        data=st.atoms_data(new)
        self.assertEqual(data['occupancy_model']['basis'],'ideal_atom_list_without_disorder_metadata')
        for version in (None,True,2):
            corrupt=copy.deepcopy(data);corrupt['occupancy_model']['version']=version
            with self.assertRaises(occ.OccupancyError):st.from_data(corrupt)

    def test_cif_partial_expansion_and_unknown_values(self):
        header='data_test\n_cell_length_a 3.6\n_cell_length_b 3.6\n_cell_length_c 3.6\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma 90\n_space_group_IT_number 225\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n_atom_site_occupancy\n'
        saved=self.open('partial.cif',header+'Cu1 Cu 0 0 0 .5\n')
        data=self.snapshot(saved['object_id']);self.assertEqual(len(data['symbols']),4)
        self.assertEqual(list(data['occupancy'].values()),[{'Cu':.5}]*4)
        self.assertEqual(self.simulate(saved['object_id'],expect=False)['error']['code'],'UNQUALIFIED_OCCUPANCY')
        for token in ('?','.'):
            p=self.root/f'unknown-{ord(token)}.cif';p.write_text(header+f'Cu1 Cu 0 0 0 {token}\n')
            self.assertEqual(self.call('open',expect=False,source_path=str(p))['error']['code'],'INVALID_OCCUPANCY')


if __name__ == '__main__': unittest.main()
