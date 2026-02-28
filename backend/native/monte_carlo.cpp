/**
 * High-performance Monte Carlo simulation engine for treasury risk.
 * Uses OpenMP for parallel path generation.
 *
 * Features:
 * - VaR/CVaR computation
 * - Portfolio risk simulation (multi-asset correlated returns)
 * - Interest rate path generation (Vasicek/GBM)
 */

#include <vector>
#include <random>
#include <algorithm>
#include <cmath>
#include <numeric>
#include <stdexcept>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace monte_carlo {

/**
 * Compute Value-at-Risk and Conditional VaR from a return distribution.
 *
 * @param returns Vector of portfolio returns (daily/weekly)
 * @param confidence Confidence level (e.g., 0.95 for 95% VaR)
 * @param portfolio_value Current portfolio value
 */
struct VaRResult {
    double var_value;
    double cvar_value;
    double mean_return;
    double std_return;
    int num_scenarios;
};

VaRResult compute_var(
    const std::vector<double>& returns,
    double confidence,
    double portfolio_value
) {
    if (returns.empty()) throw std::runtime_error("Empty returns vector");

    std::vector<double> sorted_returns = returns;
    std::sort(sorted_returns.begin(), sorted_returns.end());

    int n = static_cast<int>(sorted_returns.size());
    int var_index = static_cast<int>((1.0 - confidence) * n);
    var_index = std::max(0, std::min(var_index, n - 1));

    double var_return = sorted_returns[var_index];

    // CVaR = mean of returns below VaR
    double cvar_sum = 0;
    int cvar_count = 0;
    for (int i = 0; i <= var_index; ++i) {
        cvar_sum += sorted_returns[i];
        cvar_count++;
    }
    double cvar_return = (cvar_count > 0) ? cvar_sum / cvar_count : var_return;

    double mean = std::accumulate(returns.begin(), returns.end(), 0.0) / n;
    double sq_sum = 0;
    for (double r : returns) sq_sum += (r - mean) * (r - mean);
    double std_dev = std::sqrt(sq_sum / (n - 1));

    return {
        -var_return * portfolio_value,
        -cvar_return * portfolio_value,
        mean,
        std_dev,
        n
    };
}

/**
 * Simulate portfolio returns using correlated Geometric Brownian Motion.
 *
 * @param expected_returns Mean annual returns per asset
 * @param volatilities Annual volatilities per asset
 * @param correlation_matrix Correlation matrix (n×n)
 * @param weights Portfolio weights
 * @param num_paths Number of Monte Carlo paths
 * @param num_steps Number of time steps per path
 * @param dt Time step (e.g., 1/252 for daily)
 */
struct PortfolioSimResult {
    std::vector<double> portfolio_returns;  // Terminal portfolio returns
    std::vector<double> path_means;         // Average path value at each step
    double expected_return;
    double portfolio_volatility;
};

PortfolioSimResult simulate_portfolio(
    const std::vector<double>& expected_returns,
    const std::vector<double>& volatilities,
    const std::vector<std::vector<double>>& correlation_matrix,
    const std::vector<double>& weights,
    int num_paths,
    int num_steps,
    double dt
) {
    int n_assets = static_cast<int>(expected_returns.size());
    if (n_assets < 1) throw std::runtime_error("Need at least 1 asset");

    // Cholesky decomposition of correlation matrix
    std::vector<std::vector<double>> L(n_assets, std::vector<double>(n_assets, 0.0));
    for (int i = 0; i < n_assets; ++i) {
        for (int j = 0; j <= i; ++j) {
            double sum = 0;
            for (int k = 0; k < j; ++k) sum += L[i][k] * L[j][k];
            if (i == j) {
                double val = correlation_matrix[i][i] - sum;
                L[i][j] = (val > 0) ? std::sqrt(val) : 0;
            } else {
                L[i][j] = (L[j][j] > 0) ? (correlation_matrix[i][j] - sum) / L[j][j] : 0;
            }
        }
    }

    std::vector<double> terminal_returns(num_paths);
    std::vector<double> path_sums(num_steps + 1, 0.0);

    #ifdef _OPENMP
    #pragma omp parallel
    #endif
    {
        std::mt19937 rng;
        #ifdef _OPENMP
        rng.seed(42 + omp_get_thread_num());
        #else
        rng.seed(42);
        #endif
        std::normal_distribution<double> normal(0.0, 1.0);

        #ifdef _OPENMP
        #pragma omp for
        #endif
        for (int p = 0; p < num_paths; ++p) {
            std::vector<double> asset_values(n_assets, 1.0);

            for (int t = 0; t < num_steps; ++t) {
                // Generate correlated random numbers
                std::vector<double> z(n_assets);
                for (int i = 0; i < n_assets; ++i) z[i] = normal(rng);

                std::vector<double> corr_z(n_assets, 0.0);
                for (int i = 0; i < n_assets; ++i)
                    for (int j = 0; j <= i; ++j)
                        corr_z[i] += L[i][j] * z[j];

                // Update asset prices (GBM)
                for (int i = 0; i < n_assets; ++i) {
                    double drift = (expected_returns[i] - 0.5 * volatilities[i] * volatilities[i]) * dt;
                    double diffusion = volatilities[i] * std::sqrt(dt) * corr_z[i];
                    asset_values[i] *= std::exp(drift + diffusion);
                }

                // Portfolio value at this step
                double pv = 0;
                for (int i = 0; i < n_assets; ++i) pv += weights[i] * asset_values[i];

                #ifdef _OPENMP
                #pragma omp atomic
                #endif
                path_sums[t + 1] += pv;
            }

            // Terminal portfolio return
            double terminal = 0;
            for (int i = 0; i < n_assets; ++i) terminal += weights[i] * asset_values[i];
            terminal_returns[p] = terminal - 1.0;  // Return = final/initial - 1
        }
    }

    // Average path
    std::vector<double> avg_path(num_steps + 1);
    avg_path[0] = 1.0;
    for (int t = 1; t <= num_steps; ++t) avg_path[t] = path_sums[t] / num_paths;

    double exp_ret = std::accumulate(terminal_returns.begin(), terminal_returns.end(), 0.0) / num_paths;
    double var_sum = 0;
    for (double r : terminal_returns) var_sum += (r - exp_ret) * (r - exp_ret);
    double port_vol = std::sqrt(var_sum / (num_paths - 1));

    return {terminal_returns, avg_path, exp_ret, port_vol};
}

/**
 * Generate interest rate paths using Vasicek model.
 * dr = κ(θ - r)dt + σdW
 */
std::vector<std::vector<double>> vasicek_paths(
    double r0, double kappa, double theta, double sigma,
    double dt, int steps, int paths
) {
    std::vector<std::vector<double>> result(paths, std::vector<double>(steps + 1));

    #ifdef _OPENMP
    #pragma omp parallel
    #endif
    {
        std::mt19937 rng;
        #ifdef _OPENMP
        rng.seed(42 + omp_get_thread_num());
        #else
        rng.seed(42);
        #endif
        std::normal_distribution<double> normal(0.0, 1.0);

        #ifdef _OPENMP
        #pragma omp for
        #endif
        for (int p = 0; p < paths; ++p) {
            result[p][0] = r0;
            for (int t = 1; t <= steps; ++t) {
                double dW = normal(rng) * std::sqrt(dt);
                result[p][t] = result[p][t-1] + kappa * (theta - result[p][t-1]) * dt + sigma * dW;
            }
        }
    }

    return result;
}

} // namespace monte_carlo
