"""New public synthetic inputs and separate assessor-only truth; no tool/model calls.

python make_route_a_inputs.py NEW_OUTPUT
The public task files contain research questions, accessible images and declared
inputs only. They contain no scenario labels, generating frequencies or answers.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
import tifffile

VERSION='route-a-blind-inputs-v1'
SEED=2601102
SHAPE=(256,256)
LABELS=('r17','r42','r08','r63','r29','r51','r74','r36','r95')
SCENARIOS=('clear','weak_extra','near_doublet','noise_only','missing_calibration',
           'mixed','numerical_valid','human_revision','projection_ambiguity')
Q=((16/256,10/256),(-8/256,20/256))
CANDIDATE_CELL=3.6


def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def array_sha(a): return hashlib.sha256(np.asarray(a,dtype='<f4').tobytes(order='C')).hexdigest()
def dump(p,v): Path(p).write_text(json.dumps(v,indent=2,ensure_ascii=False,allow_nan=False)+'\n',encoding='utf-8')

def texture(qs, amplitude, phase=0.):
    y,x=np.indices(SHAPE,dtype=float)
    return np.ones(SHAPE)+sum(amplitude*np.cos(2*np.pi*(qx*x+qy*y)+phase) for qx,qy in qs)

def cif(element):
    # Explicit conventional FCC cell, full occupancy. Geometry is identical;
    # chemistry/intensity is not claimed equal. No simulator is called here.
    return f'''data_candidate
_cell_length_a {CANDIDATE_CELL}
_cell_length_b {CANDIDATE_CELL}
_cell_length_c {CANDIDATE_CELL}
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
_space_group_name_H-M_alt 'P 1'
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
{element}1 {element} 0 0 0 1
{element}2 {element} 0 0.5 0.5 1
{element}3 {element} 0.5 0 0.5 1
{element}4 {element} 0.5 0.5 0 1
'''

def generate(output):
    output=Path(output).resolve();output.mkdir(parents=True,exist_ok=False)
    public=output/'public';private=output/'assessor';public.mkdir();private.mkdir()
    # All observed input files are synthetic and independently generated from
    # prescribed equations, never from the Workbench FFT/detector.
    for label,element in [('reference-a','Cu'),('reference-b','Ni')]:
        (public/(label+'.cif')).write_text(cif(element),encoding='ascii')
    tasks=[];records=[]
    for index,(label,scenario) in enumerate(zip(LABELS,SCENARIOS)):
        seed=SEED+index;rng=np.random.default_rng(seed);qs=list(Q);amplitude=.22;dose=500.
        noiseless=False;calibration=None
        if scenario=='weak_extra': qs=[Q[0]];amplitude=.02;dose=50.
        elif scenario=='near_doublet': qs=[Q[0],((16+.6)/256,10/256)];amplitude=.20
        elif scenario=='noise_only': qs=[];amplitude=0.;dose=500.
        elif scenario=='missing_calibration': qs=[Q[0]];amplitude=.25
        elif scenario=='mixed': qs=[(16/256,10/256),(-11/256,17/256),(22/256,-6/256)];amplitude=.13
        elif scenario=='numerical_valid': noiseless=True
        elif scenario=='human_revision': qs=[Q[0]];amplitude=.25
        elif scenario=='projection_ambiguity':
            qs=[(.125,0.),(0.,.125),(.125,.125)];amplitude=.16;noiseless=True
            # q_pixel/(10*nm_per_pixel) = 2/a per Cartesian component.
            calibration={'xy_scale':{'x':.0225,'y':-.0225,'unit':'nm'},
                         'source_text':'Declared signed sampling of this public synthetic image; not an instrument calibration. No uncertainty value supplied.'}
        intensity=texture(qs,amplitude)
        # Dose means the spatial average of expected electrons/pixel; this
        # normalization is required for non-integer-frequency finite supports.
        ideal=dose*intensity/intensity.mean()
        array=(ideal if noiseless else rng.poisson(ideal)).astype(np.float32)
        path=public/(label+'.tiff');tifffile.imwrite(path,array,photometric='minisblack',metadata=None)
        task={'schema_version':1,'task_id':label,'source_path':str(path),'frame_index':0,
              'question':'围绕这幅显微图像，选择值得检查的局部区域和周期候选，进行有限的已有工具分析。说明依据、当前倾向、检查结果与仍无法判断的部分。',
              'material_context':'未提供可靠材料身份；允许提出有限工作假设，不视为实验事实。',
              'declared_calibration':calibration,'structure_candidates':[],
              'comparison_conditions':None,
              'budget':{'maximum_roi_supports':4,'maximum_distinct_ffts':6,'maximum_simulations':2,'maximum_science_calls':24},
              'source_sha256':sha(path)}
        if scenario=='projection_ambiguity':
            task['material_context']='供比较的两份原子模型是有限显式假设；来源为公开合成候选，不代表已知真实材料。'
            task['structure_candidates']=[{'label':label,'source_path':str(public/(label+'.cif')),
                'zone_axis_uvw':[0,0,1],'in_plane_direction_uvw':[1,0,0],
                'basis':'Supplied finite atomic hypothesis in a declared Cartesian frame; not an identified material.'}
                for label in ('reference-a','reference-b')]
            task['comparison_conditions']={'registration':{'rotation_deg':0,'scale':1,'translation_inv_angstrom':[0,0],'flip_y':False,
                'basis':'Declared common Cartesian geometry; not fitted to a candidate.'},
                'max_residual_inv_angstrom':.005,
                'simulation_parameters':{'voltage_kv':200,'reciprocal_radius_inv_angstrom':1.1,
                    'max_excitation_error_inv_angstrom':.02,'size':64,'sigma_pixels':1,
                    'with_direct_beam':False,'native_float32':False}}
        taskpath=public/(label+'.task.json');dump(taskpath,task)
        tasks.append({'task_id':label,'task_file':str(taskpath),'task_sha256':sha(taskpath),'source_sha256':sha(path)})
        records.append({'task_id':label,'scenario':scenario,'seed':seed,'shape_yx':SHAPE,
                        'q_xy_cycles_per_pixel':qs,'amplitude_per_carrier':amplitude,'expected_mean_signal_e_per_pixel':dose,
                        'noise_model':'none' if noiseless else 'independent Poisson',
                        'source_sha256':sha(path),'array_float32_le_c_sha256':array_sha(array),
                        'truth_scope':'prescribed image frequencies; not a material truth or requirement that every estimator recover all components',
                        'intervention_required':scenario=='human_revision'})
    dump(public/'tasks.json',{'schema_version':1,'tasks':tasks})
    dump(private/'truth.json',{'schema_version':1,'fixture_version':VERSION,'generator_sha256':sha(__file__),
          'records':records,'projection_note':'reference-a Cu and reference-b Ni have identical full-occupancy FCC geometry and cell; projected reciprocal positions agree. Intensities differ and the geometric comparison must not be promoted to unique phase. This is assessor information, never model input.'})
    dump(private/'file-hashes.json',{str(p.relative_to(output)):sha(p) for p in output.rglob('*') if p.is_file()})
    return output

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('output',type=Path);a=p.parse_args();print(generate(a.output))
