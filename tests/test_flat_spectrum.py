"""Analytic impulse spectra and explicit nonzero spectral contrast controls."""
import sys
from pathlib import Path
import unittest
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools import image_peaks as peaks


def need(ok, message, *args):
    if not ok:raise ValueError(message)


class FlatSpectrum(unittest.TestCase):
    def detect(self, f, **options):
        return peaks.detect(np.asarray(f,dtype=np.complex128),
            dict(threshold_rel=1.,refinement='none',**options),need)

    def test_analytic_delta_translation_flip_scale_window_and_dtype(self):
        # A single nonzero sample has exact constant DFT modulus at every k.
        for shape in ((31,31),(63,63),(64,64),(67,71),(127,128)):
            for dtype in (np.float32,np.float64):
                for scale in (2.**-50,1.,2.**50):
                    for y,x in ((0,0),(20,25)):
                        a=np.zeros(shape,dtype=dtype);a[y,x]=scale
                        for window in ('none','hann'):
                            b=a.astype(float)
                            if window=='hann':b*=np.outer(np.hanning(shape[0]),np.hanning(shape[1]))
                            for v in (b,np.flip(b,axis=1),np.rot90(b)):
                                rows,_,q=self.detect(np.fft.fftshift(np.fft.fft2(v)))
                                self.assertEqual(rows,[],(shape,dtype,scale,y,x,window))
                                self.assertEqual(q['numerical_contrast']['status'],'insufficient_evidence')

    def test_mean_subtracted_delta_dc_is_excluded_and_subnormal_scale(self):
        for scale in (2.**-1000,2.**-100,1.,2.**100):
            a=np.zeros((63,63));a[20,25]=scale
            f=np.fft.fftshift(np.fft.fft2(a-a.mean()))
            for radius in (0,3,64):
                rows,_,q=self.detect(f,exclude_dc_radius_bins=radius)
                self.assertEqual(rows,[])
        # Nonzero subnormal supplied amplitudes must not require an absolute floor.
        f=np.full((31,31),np.nextafter(0.,1.),dtype=complex)
        self.assertEqual(self.detect(f)[0],[])

    def test_real_weak_peaks_above_resolution_survive_near_resolution_abstains(self):
        n=63;y,x=np.indices((n,n))
        for d in (1e-14,1e-12,1e-11,1e-9):
            # Analytic DFT of shifted delta plus phase-aligned cosine: 1+d at +/-q,
            # modulus1 elsewhere. Truth is this formula, not detector/inverse FFT.
            a=np.zeros((n,n));a[20,25]=1
            a+=(2*d/n**2)*np.cos(2*np.pi*(5*(x-25)+7*(y-20))/n)
            rows,_,q=self.detect(np.fft.fftshift(np.fft.fft2(a)))
            if d in (1e-14,1e-12):
                # v3 includes the complete transform's L2 energy. v2 accepted
                # d=1e-12; that original outcome is retained in audit evidence.
                self.assertEqual(rows,[])  # Nonzero truth is explicitly unresolved, not absent.
            else:
                self.assertTrue(rows)
                self.assertTrue(all(r['bin_xy'] in ([36,38],[26,24]) for r in rows))
            self.assertFalse(q['numerical_contrast']['certified_fft_error_bound'])

    def test_direct_spectral_truth_and_intensity_scaling(self):
        for scale in (2.**-900,1.,2.**900):
            for contrast,expected in ((1e-14,False),(1e-12,False),(1e-11,True),(1e-9,True)):
                f=np.full((63,67),scale,dtype=complex);f[20,25]*=1+contrast
                rows,_,q=self.detect(f)
                self.assertEqual(bool(rows),expected)
                if expected:self.assertEqual(rows[0]['bin_xy'],[25,20])

    def test_current_admission_cannot_promote_missing_unknown_or_bool_version(self):
        for v in (None,1,True,3,'2'):
            self.assertFalse(peaks.current({'peak_detection':{'version':v}}))
        self.assertFalse(peaks.current({'peak_detection':None}))
        self.assertFalse(peaks.current({'peak_detection':{'version':2},'peak_quality':{}}))

    def test_equal_true_corner_peaks_survive_large_dc_exclusion(self):
        # Eligible peaks have equal height, but their excluded neighboring bins
        # supply real contrast. Eligibility alone is not the comparison support.
        for n,radius in ((7,4),(9,5),(11,7)):
            y,x=np.indices((n,n));q=n//2
            a=(np.cos(2*np.pi*q*(x+y)/n)+np.cos(2*np.pi*q*(x-y)/n)).astype(np.float32)
            rows,_,quality=peaks.detect(np.fft.fftshift(np.fft.fft2(a.astype(np.float64))),
                dict(exclude_dc_radius_bins=radius,min_separation_bins=1,threshold_rel=.05,refinement='none'),need)
            self.assertEqual({tuple(r['bin_xy']) for r in rows},{(0,0),(0,n-1),(n-1,0),(n-1,n-1)})
            self.assertEqual(quality['numerical_contrast']['status'],'resolved_amplitude_variation')


if __name__=='__main__':unittest.main()
