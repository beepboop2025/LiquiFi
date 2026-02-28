cmake_minimum_required(VERSION 3.20)
project(monte_carlo_ext LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

find_package(pybind11 REQUIRED)
find_package(OpenMP QUIET)

pybind11_add_module(monte_carlo_ext bindings.cpp)

target_include_directories(monte_carlo_ext PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

if(OpenMP_CXX_FOUND)
    target_link_libraries(monte_carlo_ext PRIVATE OpenMP::OpenMP_CXX)
    message(STATUS "OpenMP found — Monte Carlo will use multi-threading")
else()
    message(STATUS "OpenMP not found — Monte Carlo will run single-threaded")
endif()

target_compile_options(monte_carlo_ext PRIVATE
    $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-O3 -march=native>
    $<$<CXX_COMPILER_ID:MSVC>:/O2>
)
