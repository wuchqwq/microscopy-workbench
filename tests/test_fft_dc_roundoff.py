"""Analytic B+A*delta controls; truth never comes from a second FFT."""
from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_peaks


def need(ok, message, *args):
    if not ok:
        raise ValueError(message)


def detect_image(image, subtract_mean=False, **options):
    work = image.astype(np.float64)
    if subtract_mean:
        work -= work.mean()
    # This is the calculation under test, not the oracle. Analytic non-DC
    # modulus of B+A*delta is |A|, including after removing a constant mean.
    spectrum = np.fft.fftshift(np.fft.fft2(work))
    return image_peaks.detect(spectrum, dict(max_peaks=16, min_separation_bins=16,
        threshold_rel=.05, refinement='none', **options), need)


class DCRoundoff(unittest.TestCase):
    def test_original_background_100_impulse_never_creates_periodic_peaks(self):
        image = np.full((63,63), 100, dtype=np.float32)
        image[20,25] = 101
        for subtract in (False, True):
            with self.subTest(subtract_mean=subtract):
                rows, _, quality = detect_image(image, subtract)
                self.assertEqual(rows, [])
                self.assertEqual(quality['numerical_contrast']['status'], 'insufficient_evidence')

    def test_background_position_shape_and_supported_scalar_dtypes(self):
        for dtype in (np.uint8,np.uint16,np.uint32,np.int8,np.int16,np.int32,np.float32,np.float64):
            for shape in ((31,31),(62,65),(63,63),(64,64),(67,71)):
                for background in (0,1,100):
                    for y,x in ((0,0),(20,25),(shape[0]-1,shape[1]-1)):
                        image = np.full(shape, background, dtype=dtype)
                        image[y,x] = background+1
                        for subtract in (False,True):
                            with self.subTest(dtype=str(dtype),shape=shape,B=background,position=(y,x),subtract=subtract):
                                self.assertEqual(detect_image(image, subtract)[0], [])

    def test_large_background_and_quantized_away_impulse(self):
        for dtype in (np.float32,np.float64):
            for background in (1e4,1e8,2.**40):
                for amplitude in (0.,1.,float(np.spacing(dtype(background)))):
                    image=np.full((63,63),background,dtype=dtype)
                    image[20,25]=background+amplitude
                    # If casting erased A, the actual image is constant; the
                    # independent non-DC truth is zero, not the nominal A.
                    actual=float(image[20,25])-float(image[0,0])
                    self.assertGreaterEqual(actual,0)
                    for subtract in (False,True):
                        with self.subTest(dtype=str(dtype),B=background,A=actual,subtract=subtract):
                            self.assertEqual(detect_image(image,subtract)[0],[])

    def test_resolvable_weak_cosines_on_background_are_preserved(self):
        n=63;y,x=np.indices((n,n))
        expected={(6/n,0.),(-6/n,0.),(0.,8/n),(0.,-8/n)}
        for dtype in (np.float32,np.float64):
            image=(100+.001*np.cos(2*np.pi*6*x/n)+.001*np.cos(2*np.pi*8*y/n)).astype(dtype)
            for subtract in (False,True):
                work=image.astype(np.float64)
                if subtract:work-=work.mean()
                rows,_,_=image_peaks.detect(np.fft.fftshift(np.fft.fft2(work)),
                    dict(max_peaks=16,min_separation_bins=3,threshold_rel=.05,refinement='none'),need)
                self.assertEqual({tuple(row['frequency_cycles_per_pixel']) for row in rows},expected)

    def test_dynamic_range_does_not_overflow_normalization(self):
        for exponent in (-900,900):
            image=np.full((63,63),2.**exponent)
            image[20,25]+=2.**exponent/1024
            for subtract in (False,True):
                rows,_,quality=detect_image(image,subtract)
                self.assertEqual(rows,[])
                self.assertTrue(np.isfinite(quality['numerical_contrast']['relative_resolution_guard']))


if __name__=='__main__':
    unittest.main()
