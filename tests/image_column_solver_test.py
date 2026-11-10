"""Bounded stopping-regression checks; scientific acceptance is unchanged."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import image_column_model as model, image_column_solver as config


class SolverStopping(unittest.TestCase):
    def test_zero_counts_and_rank_deficiency_do_not_optimize(self):
        with patch.object(model, 'minimize', side_effect=AssertionError('inadmissible optimizer')):
            self.assertEqual(model.fit_linear_poisson([0, 0], np.eye(2))['status'], 'UNKNOWN_ZERO_COUNTS')
            self.assertEqual(model.fit_linear_poisson([2, 3], np.ones((2, 2)))['status'], 'UNKNOWN_NONIDENTIFIABLE_DESIGN')

    def test_nonnegative_boundary_and_actual_stopping_options(self):
        with patch.object(model, 'minimize', wraps=model.minimize) as optimizer:
            result = model.fit_linear_poisson([20, 0], np.eye(2))
        self.assertEqual(result['status'], 'CONDITIONAL_POINT_ESTIMATE')
        np.testing.assert_allclose(result['mu'], [20, 0], atol=1e-6)
        self.assertLessEqual(result['projected_gradient'], 5e-6)
        self.assertEqual(optimizer.call_args.kwargs['options']['ftol'], config.SOLVER['ftol'])
        self.assertEqual(config.SOLVER['ftol'], 1e-13)
        self.assertEqual(config.SOLVER['projected_gradient_limit'], 5e-6)

    def test_evaluation_and_iteration_exhaustion_remain_unknown(self):
        design = np.array([[1., .1], [.2, 1.], [.1, .4]])
        for budget in [{'maxfun': 1}, {'maxiter': 1}]:
            with self.subTest(budget=budget):
                result = model.fit_linear_poisson([100, 3, 7], design, **budget)
                self.assertEqual(result['status'], 'UNKNOWN_NOT_CONVERGED')
                self.assertFalse(result['optimizer_success'])
                self.assertTrue(np.isfinite(result['mu']).all())


if __name__ == '__main__':
    unittest.main()
