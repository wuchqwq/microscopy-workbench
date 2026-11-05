# Conditional S2 engineering increment

The accepted route keeps baseline HRTEM peak observation and STEM S0 fixed ROI
statistics as defaults. An explicit `image_column_fit` tool adds conditional S2
measurements. It is not an automatic occupancy, defect or phase classifier.
The scientific contract in this directory was committed before implementation.

Engineering parent: `a0258f7cb3d108fb106da6cc929af6e769c0cebf`; its production
code equals `db2d71383bb1d3b50e8dba4701553550d016e46e`. The isolated branch is
`feat/conditional-stem-column-fit-20261105`. Remote main was reported through
[the branch API](https://api.github.com/repos/wuchqwq/microscopy-workbench/branches/main)
at `c69424ac25a35efd816d68cacd5904f5381c7485`; no fetch, push or merge is part of
this increment. The original engineering checkout is read-only.

The separate research repository is run ID `baseline-comparison-execution-v1`,
commit `c9fc6bd267d67144a85a3dbb42f2049d3cdfc245`. Its complete local bundle is
`artifacts/baseline-comparison-execution-v1.bundle` within that run, SHA256
`0fcbb723f7a1aff39e560d120482fc6df303cab6dd32bbd921fc45d4e26fb99a`.
It remains separate; no 54 MB bundle is duplicated in the engineering tree.

Byte-exact route evidence copied here:

| File | SHA256 |
| --- | --- |
| method-selection-v1.json | 6493d69f9ffe724ba371e615a6ec1a6db54d66f7076a4511f72ba48d51b67ab5 |
| METHOD-SELECTION.md | 51027c281d3adbd2653e868c2cda0ec001847b863dda98acaff4de12ed73e806 |
| research-selection-spec-v1.json | ab5515cc18092f4d56a267294e4b0e7731ee8273b633039c9a0081044474f7f6 |

The research numerical model has SHA256
`87c0cf265e2b663e01aea622ec4b7b032930d765ea7b45697f50bb5d9088d210`.
Only its fixed S2 numerical functions will be ported. Operational bounds are
checked before its rank test/optimizer; the separate confidence diagnostic is
excluded. Numerical convergence is conditional on unverified caller assumptions.

The physical convergence gate remains **10.034456% > 10%, FAIL**; formal physical
blind acceptance remains **NOT_TESTED**. This increment requires only bounded
representative integration regression, not a repeat of the research matrix.

The new kind uses existing request journals, saved object identities, exports
and discovery evidence. Panel editing and automatic Panel savepoint slots are
outside this version. No new AnalysisContext slot is created.
