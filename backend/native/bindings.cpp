/**
 * pybind11 bindings for the Monte Carlo engine.
 * Exposes C++ functions to Python as the `monte_carlo_ext` module.
 */

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <pybind11/numpy.h>

#include "monte_carlo.cpp"

namespace py = pybind11;


PYBIND11_MODULE(monte_carlo_ext, m) {
    m.doc() = "High-performance Monte Carlo simulation engine (C++ with OpenMP)";

    py::class_<monte_carlo::VaRResult>(m, "VaRResult")
        .def_readonly("var_value", &monte_carlo::VaRResult::var_value)
        .def_readonly("cvar_value", &monte_carlo::VaRResult::cvar_value)
        .def_readonly("mean_return", &monte_carlo::VaRResult::mean_return)
        .def_readonly("std_return", &monte_carlo::VaRResult::std_return)
        .def_readonly("num_scenarios", &monte_carlo::VaRResult::num_scenarios);

    m.def("compute_var",
        [](py::array_t<double> returns, double confidence, double portfolio_value) {
            auto buf = returns.unchecked<1>();
            std::vector<double> vec(buf.shape(0));
            for (int i = 0; i < buf.shape(0); ++i) vec[i] = buf(i);
            return monte_carlo::compute_var(vec, confidence, portfolio_value);
        },
        py::arg("returns"), py::arg("confidence") = 0.95, py::arg("portfolio_value") = 1000000.0,
        "Compute VaR and CVaR from return distribution."
    );

    m.def("simulate_portfolio",
        [](py::array_t<double> expected_returns, py::array_t<double> volatilities,
           py::list correlation_matrix, py::array_t<double> weights,
           int num_paths, int num_steps, double dt) {

            auto er = expected_returns.unchecked<1>();
            auto vol = volatilities.unchecked<1>();
            auto w = weights.unchecked<1>();
            int n = er.shape(0);

            std::vector<double> er_vec(n), vol_vec(n), w_vec(n);
            for (int i = 0; i < n; ++i) {
                er_vec[i] = er(i); vol_vec[i] = vol(i); w_vec[i] = w(i);
            }

            std::vector<std::vector<double>> corr(n, std::vector<double>(n));
            for (int i = 0; i < n; ++i) {
                py::list row = correlation_matrix[i].cast<py::list>();
                for (int j = 0; j < n; ++j) corr[i][j] = row[j].cast<double>();
            }

            auto result = monte_carlo::simulate_portfolio(er_vec, vol_vec, corr, w_vec, num_paths, num_steps, dt);

            return py::dict(
                py::arg("portfolio_returns") = result.portfolio_returns,
                py::arg("path_means") = result.path_means,
                py::arg("expected_return") = result.expected_return,
                py::arg("portfolio_volatility") = result.portfolio_volatility
            );
        },
        py::arg("expected_returns"), py::arg("volatilities"),
        py::arg("correlation_matrix"), py::arg("weights"),
        py::arg("num_paths") = 10000, py::arg("num_steps") = 252, py::arg("dt") = 1.0/252,
        "Simulate portfolio returns with correlated GBM."
    );

    m.def("vasicek_paths",
        [](double r0, double kappa, double theta, double sigma, double dt, int steps, int paths) {
            auto result = monte_carlo::vasicek_paths(r0, kappa, theta, sigma, dt, steps, paths);

            // Return as numpy 2D array
            py::array_t<double> out({paths, steps + 1});
            auto buf = out.mutable_unchecked<2>();
            for (int p = 0; p < paths; ++p)
                for (int t = 0; t <= steps; ++t)
                    buf(p, t) = result[p][t];
            return out;
        },
        py::arg("r0"), py::arg("kappa"), py::arg("theta"), py::arg("sigma"),
        py::arg("dt") = 1.0/252, py::arg("steps") = 252, py::arg("paths") = 1000,
        "Generate interest rate paths using Vasicek model."
    );
}
