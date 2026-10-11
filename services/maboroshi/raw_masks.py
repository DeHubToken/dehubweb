from pathlib import Path
import os,json,time,zipfile,io
import requests

def segment_raw(video,folder,prompt='person'):
    from providers import prediction
    folder=Path(folder)
    j=prediction('mask',video,folder,prompt)
    r=requests.get(j['output'],timeout=180);r.raise_for_status();(folder/'sam-masks.zip').write_bytes(r.content)
    out=folder/'raw-masks';out.mkdir(exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(r.content)) as z:
        for name in z.namelist():
            base=Path(name).name
            if base.startswith('mask_') and base.endswith('.png'):(out/base).write_bytes(z.read(name))
    return out

def clean_border_fragments(folder):
    """Remove tiny, narrow disconnected edge fragments; preserve large edge subjects."""
    import numpy as np
    from PIL import Image
    from scipy.ndimage import label
    folder=Path(folder);output=folder.parent/'clean-masks';output.mkdir(exist_ok=True)
    report=[]
    for p in sorted(folder.glob('mask_*.png')):
        a=np.asarray(Image.open(p).convert('L'))>127;labels,_=label(a);h,w=a.shape;removed=0
        for ident in (set(labels[:,0])|set(labels[:,-1]))-{0}:
            y,x=np.where(labels==ident)
            if len(x)<h*w*.03 and x.max()-x.min()+1<=max(6,int(w*.05)):
                a[labels==ident]=False;removed+=len(x)
        Image.fromarray(a.astype(np.uint8)*255).save(output/p.name)
        report.append({'frame':p.stem,'removed_border_pixels':removed,'mask_pixels':int(a.sum()),'left_right_edge_pixels':int(a[:,0].sum()+a[:,-1].sum())})
    (folder.parent/'mask-cleanup-report.json').write_text(json.dumps(report,indent=2))
    return output
