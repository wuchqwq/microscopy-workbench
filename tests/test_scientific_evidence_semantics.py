"""Independent truth for evidence semantics, shared calibration and GPA transfer.

The fit truth is an explicit rotation, the uncertainty oracle is forward
sampling, and the GPA truth is an analytic displacement. No product solver
generates the expected observations. Synthetic data only.
"""
import copy
import math
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import numpy as np
import tifffile

sys.path.insert(0, os.environ.get('MICROSCOPY_TEST_REPOSITORY', str(Path(__file__).resolve().parents[1])))
from crystallography.geometry import calibration_map, measure_geometry, GeometryError
from crystallography.registration_proposal import propose, RegistrationError
from tools import image_workspace as worker, image_domain_compare as domain, image_gpa_core as gpa


def measurements(vectors):
    record = dict(calibration_id='a'*32, revision=1, status='active',
                  source='user_statement_not_independently_verified', coordinate_domain='real_space',
                  xy_scale=dict(x=1., y=1., unit='angstrom'))
    dependency = {k:record[k] for k in ('calibration_id','revision','status','source','coordinate_domain')}
    return [dict(object_id=f'{i+1:032x}',request_id='analytic-'+str(i),source_object_id='b'*32,
                 xy_calibration=record,calibration_dependency=dependency,measurement_domain='reciprocal_space',
                 coordinate_space='frequency_cycles_per_pixel',points=[[0,0],v],physical_vector_xy=v,
                 physical_frequency_unit='1/angstrom',dc_reference_point_index=0) for i,v in enumerate(vectors)]


def proposal(vectors, hkls, hold=(2,), angle=23.):
    theta=math.radians(angle)
    # Oracle matrix is elementary cosine/sine, not production registration.
    rotated=[[math.cos(theta)*x-math.sin(theta)*y,math.sin(theta)*x+math.cos(theta)*y,0.]
             for x,y in vectors]
    simulation=dict(reciprocal_enumeration=dict(completeness_certified=True),reflections=dict(
        coordinates_inv_angstrom=rotated,hkl=hkls,kinematic_intensity=[1.]*len(vectors),
        reciprocal_convention='cycles_per_angstrom_no_2pi',
        coordinates_frame='rotated laboratory xyz; beam +z; raster columns +x, rows +y'))
    args=dict(measurements=measurements(vectors),simulation=simulation,
              fit_correspondences=[dict(measurement_index=i,hkl=hkls[i]) for i in (0,1)],
              validation_correspondences=[dict(measurement_index=i,hkl=hkls[i]) for i in hold],
              screen_axes=dict(flip_y=False,basis='analytic signed axes'),max_residual_inv_angstrom=.003,
              experimental_kind='real_space_fft',confirmation=dict(source='synthetic_fixture',source_text='Analytic caller assertions, no independent observation resolution proof'))
    return args,propose(**args)


class RegistrationSemantics(unittest.TestCase):
    def test_true_rotation_and_wrong_holdout_do_not_turn_geometry_into_validation(self):
        args,result=proposal([[.25,0.],[0.,.25],[.25,.25]],[[1,0,0],[0,1,0],[1,1,0]])
        self.assertAlmostEqual(result['registration']['rotation_deg'],23.,places=12)
        self.assertTrue(result['held_out_geometry_passed'])
        self.assertIsNone(result['held_out_validation_passed'])
        self.assertEqual(result['validation_status'],'insufficient_evidence')
        self.assertEqual(result['evidence_semantics_version'],2)
        # Deliberately wrong held-out prediction: the fit is unchanged.
        args['simulation']['reflections']['coordinates_inv_angstrom'][2][0]+=.1
        wrong=propose(**args)
        self.assertAlmostEqual(wrong['registration']['rotation_deg'],23.,places=12)
        self.assertFalse(wrong['held_out_geometry_passed'])

    def test_sub_bin_alias_and_near_conjugate_remain_unvalidated(self):
        for sign in (1.,-1.):
            _,r=proposal([[.25,0.],[0.,.25],[sign*.25,sign*-.00031249389666318316]],
                         [[1,0,0],[0,1,0],[int(sign),0,int(sign)]])
            self.assertTrue(r['held_out_geometry_passed'])
            self.assertIsNone(r['held_out_validation_passed'])
            self.assertEqual(r['independent_validation']['status'],'insufficient_evidence')
        with self.assertRaises(RegistrationError):
            proposal([[.25,0.],[0.,.25],[-.25,0.]],[[1,0,0],[0,1,0],[-1,0,0]])
        _,ulp=proposal([[.25,0.],[0.,.25],[float(np.nextafter(.25,1.)),0.]],
                       [[1,0,0],[0,1,0],[1,0,1]])
        self.assertTrue(ulp['held_out_geometry_passed'])
        self.assertTrue(ulp['held_out_independence']['unresolved_binary64_aliases'])
        self.assertIsNone(ulp['held_out_validation_passed'])
        _,empty=proposal([[.25,0.],[0.,.25]],[[1,0,0],[0,1,0]],hold=())
        self.assertEqual(empty['validation_status'],'not_tested_no_held_out')


class Uncertainty(unittest.TestCase):
    def mapping(self, scale=(1.,1.), sigma=(.01,.01), correlation=0.):
        return calibration_map(dict(mode='explicit',scale_xy=list(map(float,scale)),scale_sigma_xy=list(map(float,sigma)),
                                    scale_correlation_xy=correlation,unit='1/nm',
                                    convention='cycles_per_length',basis='Independent synthetic error model'))

    def test_shared_isotropic_scale_cancels_from_angle_including_flipped_axis(self):
        spots=[dict(id='a',xy=[10.,10.],sigma_px=[0.,0.]),dict(id='b',xy=[10.,-10.],sigma_px=[0.,0.])]
        for scale,correlation in [((1.,1.),1.),((1.,-1.),-1.)]:
            result=measure_geometry([0.,0.],spots,self.mapping(scale=scale,correlation=correlation),[0.,0.])
            self.assertAlmostEqual(result['angles'][0]['sigma_deg'],0.,places=14)
            self.assertAlmostEqual(result['spots'][0]['d_sigma_nm'],.01/math.sqrt(200),places=14)
        independent=measure_geometry([0.,0.],spots,self.mapping(),[0.,0.])
        self.assertGreater(independent['angles'][0]['sigma_deg'],.8)

    def test_partial_scale_correlation_matches_independent_forward_monte_carlo(self):
        rho=-.65;scale=np.array([.021,-.032]);ss=np.array([.00002,.00003])
        points=np.array([[60.,21.],[-11.,67.]])
        ps=np.array([[.08,.06],[.05,.1]]);cs=np.array([.07,.09])
        spots=[dict(id=str(i),xy=p.tolist(),sigma_px=ps[i].tolist()) for i,p in enumerate(points)]
        r=measure_geometry([0.,0.],spots,self.mapping(scale,ss,rho),cs.tolist())
        rng=np.random.default_rng(4219);n=150000
        z=rng.normal(size=(n,2))
        sample_scale=scale+np.column_stack((z[:,0],rho*z[:,0]+math.sqrt(1-rho*rho)*z[:,1]))*ss
        c=rng.normal(size=(n,2))*cs
        p=points+rng.normal(size=(n,2,2))*ps
        vectors=(p-c[:,None,:])*sample_scale[:,None,:]
        d=1/np.linalg.norm(vectors,axis=-1)
        arg=np.arctan2(vectors[...,1],vectors[...,0])
        theta=abs((arg[:,1]-arg[:,0]+np.pi)%(2*np.pi)-np.pi)*180/np.pi
        actual=np.array([d[:,0].std(ddof=1),d[:,1].std(ddof=1),theta.std(ddof=1)])
        expected=np.array([s['d_sigma_nm'] for s in r['spots']]+[r['angles'][0]['sigma_deg']])
        np.testing.assert_allclose(actual,expected,rtol=.012,atol=0)
        missing=measure_geometry([0.,0.],spots,self.mapping(scale,ss,rho))
        self.assertEqual(missing['spots'][0]['uncertainty_status'],'UNKNOWN')

    def test_fold_and_invalid_correlations_are_not_confidence_claims(self):
        for x in (200.,-200.):
            spots=[dict(id='a',xy=[100.,0.],sigma_px=[0.,.1]),dict(id='b',xy=[x,0.],sigma_px=[0.,.1])]
            r=measure_geometry([0.,0.],spots,self.mapping(sigma=(0.,0.)),[0.,0.])
            angle=r['angles'][0]
            self.assertIsNone(angle['sigma_deg'])
            self.assertGreater(angle['linearized_unwrapped_sigma_deg'],0)
            self.assertEqual(angle['uncertainty_status'],'nonlinear_fold_unresolved')
        for rho in (1.01,float('nan'),True):
            with self.assertRaises(GeometryError):self.mapping(correlation=rho)

    def test_correlation_is_preserved_across_units_and_capture_axes(self):
        spots=[dict(id='a',xy=[60.,21.],sigma_px=[.08,.06]),dict(id='b',xy=[-11.,67.],sigma_px=[.05,.1])]
        def values(mapping):
            r=measure_geometry([0.,0.],spots,mapping,[.07,.09])
            return [r['spots'][0]['d_nm'],r['spots'][0]['d_sigma_nm'],r['angles'][0]['sigma_deg']]
        expected=values(self.mapping((.021,-.032),(.00002,.00003),-.65))
        for unit,convention,factor in [('1/angstrom','cycles_per_length',.1),('rad/nm','radians_per_length',2*math.pi)]:
            mapping=calibration_map(dict(mode='explicit',scale_xy=[.021*factor,-.032*factor],
                scale_sigma_xy=[.00002*factor,.00003*factor],scale_correlation_xy=-.65,
                unit=unit,convention=convention,basis='Equivalent analytic metric'))
            np.testing.assert_allclose(values(mapping),expected,rtol=1e-13,atol=0)
        axes=[dict(scale=.021,unit='1/nm',calibrated_value_at_pixel_zero=0.),
              dict(scale=-.0032,unit='1/angstrom',calibrated_value_at_pixel_zero=0.)]
        mapping=calibration_map(dict(mode='capture_axes',convention='cycles_per_length',
            scale_sigma_xy=[.00002,.000003],scale_correlation_xy=-.65),axes)
        np.testing.assert_allclose(values(mapping),expected,rtol=1e-13,atol=0)
        with self.assertRaises(GeometryError):
            calibration_map(dict(mode='explicit',scale_xy=[1.,1.],scale_correlation_xy=1.,
                unit='1/nm',convention='cycles_per_length',basis='Missing SD'))


class GPAEvidence(unittest.TestCase):
    def test_transfer_matches_analytic_slow_field_and_reports_filtered_out_strain(self):
        y,x=np.indices((256,256),dtype=float)
        for periods,sigma in ((1,.018),(8,.008)):
            k=periods/256.;u=.1*np.sin(2*np.pi*k*x)
            a=np.cos(2*np.pi*.125*(x-u))+np.cos(2*np.pi*.125*y)
            result=gpa.analyze(np.fft.fftshift(np.fft.fft2(a)).astype(np.complex128),[[.125,0],[0,.125]],sigma,[92,92,116,116])
            assessment=gpa.evidence_assessment(result['report'])
            row=next(v for v in assessment['spatial_transfer']['response_samples'] if v['modulation_period_pixels']==1/k)
            exact=.5*((1/(1-.1*2*np.pi*k*np.cos(2*np.pi*k*x)))**2-1)
            observed=result['arrays']['strain_green_lagrange_xy'][64:192,64:192,0,0]
            response=np.linalg.norm(observed)/np.linalg.norm(exact[64:192,64:192])
            self.assertAlmostEqual(response,row['first_order_strain_gain_1d_per_reflection'][0],delta=.002)
            self.assertEqual(assessment['material_strain_status'],'insufficient_evidence')
            if periods==8:
                self.assertEqual(row['phase_gain_per_reflection'],[0.,0.])
                self.assertGreater(np.max(abs(exact)),.019)

    def test_saved_noise_and_mixed_fields_propagate_current_evidence_to_reads(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);counter=0
            def call(action,**kw):
                nonlocal counter;counter+=1
                r=worker.execute(dict(action=action,workspace=str(root/'workspace'),request_id='sci-'+str(counter),**kw))
                self.assertTrue(r['ok'],r);return r['result']
            y,x=np.indices((256,256));noise=np.random.default_rng(0).normal(size=(256,256))
            mixed=np.cos(2*np.pi*.125*x)+.8*np.cos(2*np.pi*(.125+1/256)*x)+np.cos(2*np.pi*.125*y)
            for i,data in enumerate((noise,mixed)):
                path=root/f'{i}.tiff';tifffile.imwrite(path,data.astype('float32'))
                source=call('open',source_path=str(path));frame=call('frame',object_id=source['object_id'],frame_index=0)
                fft=call('fft',object_id=frame['object_id'],window='none',subtract_mean=True)
                result=call('gpa',object_id=fft['object_id'],source_domain='real_space_lattice',source_domain_text='Intentional synthetic model-failure input',
                            g_vectors=[[.125,0],[0,.125]],mask_sigma=.018,reference_rect=[92,92,116,116],reference_mode='fixed_g',reference_text='Test carrier assumption')
                self.assertGreater(result['report']['quality']['tensor_valid_pixels'],100)
                self.assertEqual(result['evidence_assessment']['material_strain_status'],'insufficient_evidence')
                read=call('gpa_read',object_id=result['object_id'],points=[[128,128]])
                self.assertEqual(read['evidence_assessment'],result['evidence_assessment'])


class HistoricalComparison(unittest.TestCase):
    def test_v1_report_reopens_unchanged_new_physical_request_abstains(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);counter=0
            def call(action,**kw):
                nonlocal counter;counter+=1
                req=dict(action=action,workspace=str(root/'workspace'),**kw)
                if action not in ('get','result'):req['request_id']='history-'+str(counter)
                r=worker.execute(req);self.assertTrue(r['ok'],r);return r['result']
            y,x=np.indices((64,160));path=root/'identical.tiff'
            tifffile.imwrite(path,(np.cos(2*np.pi*x/8)+np.cos(2*np.pi*y/8)).astype('float32'))
            opened=call('open',source_path=str(path));frame=call('frame',object_id=opened['object_id'],frame_index=0)
            atlas=call('spatial_atlas',object_id=frame['object_id'],rects=[[0,0,64,64],[96,0,160,64]],window='none',subtract_mean=True,max_peaks=8,
                       peak_options={'threshold_rel':.1,'refinement':'none'},max_size=256)
            params=dict(object_id=atlas['object_id'],reference_index=0,angles_degrees=[0.],coordinate_domain='physical',tolerance=.001)
            derive=domain.derive
            def legacy(*args,**kw):
                kw['semantics_version']=1;return derive(*args,**kw)
            with patch.object(domain,'derive',side_effect=legacy):old=call('local_signature_compare',**params)
            self.assertNotIn('evidence_semantics_version',old)
            self.assertEqual(old['relations'][0]['status'],'incompatible')
            protected={p:p.read_bytes() for p in (root/'workspace').rglob('*') if p.is_file()}
            self.assertEqual(call('result',query_request_id=old['request_id']),old)
            # get invokes the saved comparison's version-specific validator.
            self.assertEqual(call('get',object_id=old['object_id'])['relations'],old['relations'])
            current=call('local_signature_compare',**params)
            self.assertEqual(current['relations'][0]['status'],'insufficient_evidence')
            self.assertEqual(current['evidence_semantics_version'],2)
            pixel=call('local_signature_compare',**{**params,'coordinate_domain':'pixel'})
            self.assertEqual(pixel['relations'][0]['status'],'compatible_signature')
            for file,raw in protected.items():self.assertEqual(file.read_bytes(),raw)


if __name__=='__main__':unittest.main()
