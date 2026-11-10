"""Direct user-feedback checks: units, evidence limits and partial usability."""
import copy
from pathlib import Path
import sys
import unittest
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_peak_comparison as comparison
from tools import image_workspace as worker


class Feedback(unittest.TestCase):
    def report(self, mode='observed'):
        a = np.ones((2, 32, 32)); a[:, :, 16:] = 1.6
        p = np.zeros(a.shape); p[0, :, 16:] = .4; p[1, :, 16:] = -.4
        low = np.zeros(a.shape, bool)
        if mode == 'dark': low[:, :, 16:] = True
        if mode == 'incoherent': p[:, :, 16:] = 0.; p[:, :, 16::2] = np.pi
        seed = dict(shape_yx=[32, 32], object_id='direct-synthetic', parameters={'g_vectors': [[.125, 0], [0, .125]]}, input_dependency={})
        return comparison.summarize(dict(amplitude=a, phase_demodulated_wrapped=p,
            valid_phase=np.ones(a.shape, bool), low_amplitude=low), seed,
            dict(roi_rect=[16, 0, 32, 32], reference_rect=[0, 0, 16, 32], reference_text='Synthetic reference assumption'), worker)

    def test_observed_text_units_precision_support_and_no_mutation(self):
        report = self.report(); before = copy.deepcopy(report)
        preview = '\n'.join(comparison.preview_lines(report))
        text = comparison.readable(report)
        for expected in ('cycles/pixel', 'local pixels', '6 significant digits', 'amplitude ratio 1.6',
                         'wrapped phase +0.4 rad', 'wrapped phase -0.4 rad', 'ROI 512/512', 'low amplitude: 0 / 0'):
            self.assertIn(expected, preview)
        self.assertIn('not material strain', preview)
        for expected in ('Synthetic reference assumption', 'not physical displacement', 'does not measure local frequency',
                         'deterministic guards, not confidence', 'exact saved band: direct-synthetic:band:0'):
            self.assertIn(expected, text)
        self.assertEqual(report, before)

    def test_dark_support_never_displays_zero_or_a_phase_claim(self):
        report = self.report('dark')
        preview = '\n'.join(comparison.preview_lines(report))
        self.assertIn('amplitude ratio unavailable; wrapped phase unavailable', preview)
        self.assertIn('ROI 0/512', preview)
        self.assertIn('keep unsupported values unavailable', comparison.readable(report))
        self.assertNotIn('wrapped phase +0', preview)

    def test_incoherence_preserves_amplitude_and_selects_phase_inspection(self):
        report = self.report('incoherent')
        self.assertTrue(all(p['phase_difference_wrapped_rad'] is None for p in report['peaks']))
        self.assertTrue(all(abs(p['amplitude_ratio']-1.6) < 1e-14 for p in report['peaks']))
        for text in ('\n'.join(comparison.preview_lines(report)), comparison.readable(report)):
            self.assertIn('amplitude ratio 1.6', text)
            self.assertIn('wrapped phase unavailable', text)
            self.assertIn('Amplitude comparisons remain usable', text)
            self.assertIn('Inspect spatial phase variation', text)


if __name__ == '__main__':
    unittest.main()
