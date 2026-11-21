"""Display only: normalization -> contrast/brightness clamp -> gamma -> color LUT.
Never called by array statistics, FFT or fitting. No quantitative output.
"""
import json,re,math
from pathlib import Path
import numpy as np
PALETTES=json.loads(Path(__file__).with_name('display_colormaps.json').read_text())
DEFAULT={'brightness':0.,'contrast':1.,'colormap':'gray','reverse':False,'colors':['#000000','#ffffff']}
def tone_options(raw=None):
    if raw is None:raw={}
    if type(raw) is not dict or set(raw)-set(DEFAULT)-{'positions'}:raise ValueError('Unknown or invalid display tone field')
    v={**DEFAULT,**raw}
    for key,lo,hi in [('brightness',-1,1),('contrast',0,4)]:
        x=v[key]
        if type(x) not in (int,float) or not math.isfinite(x) or not lo<=x<=hi:raise ValueError('Invalid display '+key)
    if v['colormap'] not in ('gray','viridis','cividis','magma','custom') or type(v['reverse']) is not bool:raise ValueError('Invalid display colormap/reverse')
    if type(v['colors']) is not list or not 2<=len(v['colors'])<=8 or any(type(c) is not str or not re.fullmatch(r'#[0-9a-fA-F]{6}',c) for c in v['colors']):raise ValueError('Display colors require 2..8 #RRGGBB stops')
    positions=v.get('positions')
    if positions is not None and (type(positions) is not list or len(positions)!=len(v['colors']) or positions[0]!=0 or positions[-1]!=1 or any(type(x) not in (int,float) or not math.isfinite(x) or not 0<=x<=1 or (i>0 and x<=positions[i-1]) for i,x in enumerate(positions))):raise ValueError('Display positions must strictly increase from 0 to 1 and match colors')
    if 'positions' in v and positions is None:raise ValueError('Display positions cannot be null')
    return {**v,'colors':[c.lower() for c in v['colors']]}
def colorize(normalized,gamma,tone):
    t=tone_options(tone)
    n=np.power(np.clip((normalized-.5)*t['contrast']+.5+t['brightness'],0.,1.),1./gamma)
    if t['reverse']:n=1.-n
    if t['colormap']=='gray':return np.floor(n*255.+.5).astype(np.uint8)
    stops=t['colors'] if t['colormap']=='custom' else PALETTES[t['colormap']]
    table=np.array([[int(c[i:i+2],16) for i in (1,3,5)] for c in stops],dtype=np.float64)
    x=n*(len(table)-1);a=np.floor(x).astype(np.int64);b=np.minimum(a+1,len(table)-1);f=(x-a)[...,None]
    if t['colormap']=='custom' and 'positions' in t:
        pos=np.asarray(t['positions']);a=np.clip(np.searchsorted(pos,n,side='right')-1,0,len(table)-2);b=a+1;f=((n-pos[a])/(pos[b]-pos[a]))[...,None]
    return np.floor(table[a]*(1-f)+table[b]*f+.5).astype(np.uint8)
