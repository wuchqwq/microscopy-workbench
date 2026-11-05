# HRTEM reproduction source staging

This is an archival subset of existing research scripts. Two source files were copied byte for byte; no generator, evaluator, model or test was executed. No scientific parameters were edited.

| Archived source | Pinned scientific checkout | SHA256 |
|---|---|---|
| navigation-local-prepare.py | a83bf8aae5fcffc30adfb81059232b180e3000df | bf1fbb6a9d1af664da36e8b4ed392e5d3bec489e1b76cf377394abb5f5a7c08f |
| fft_boundary_experiment.py | 7a1d3e01f9142432345fa4754268437c90a17d04 | ec32c63cab8ce5f8865763f9ce290300f7c34700e70a5dd7169736b283d8795c |

The full source texts were reviewed for user absolute paths, private-log paths, session bodies or IDs, credentials and restricted Library identifiers. Their hashes match the original frozen provenance. See provenance.json for exact byte counts and source-relative locations.

Place an unmodified script in a **new isolated reproduction root** with its required sibling checkout. Do not execute these copies in the original evidence root, and do not edit a script merely to point it at old outputs.

- Navigation generator: Python, Git CLI, NumPy and tifffile; sibling core-cross-ci-wiring/ must be pinned to a83bf8aae5fcffc30adfb81059232b180e3000df and include the six specified Skill/reference files. The script creates the sibling navigation-local-a83-01/ and refuses an already existing output directory. Newly generated manifest/freeze/console records contain runtime-resolved paths and need a separate publication review.
- FFT boundary driver: Python, Git CLI, NumPy, SciPy and tifffile; sibling science-7a1d3e0/ must be pinned to 7a1d3e01f9142432345fa4754268437c90a17d04, including tools/image_peaks.py. Output is the sibling fft-peak-boundary-7a1d3e0/. prepare requires the entire output directory to be absent; run requires observations/ absent and verifies frozen plan, runner and Git identities.

The existing FFT entry points are documented here for future controlled reproduction; they were **not executed during archival**:

    python -B fft_boundary_experiment.py prepare
    python -B fft_boundary_experiment.py run

A third reviewed source, navigation-local-a83-01/score.py, was **not copied**. It reads private session records and emits session identities, which fails this task's unmodified-public-source rule. Its preserved source SHA256 is 06f297f62381d9193df4fc88f23d55f3ae6e21f76f917e2d170ba4f9572b3674. No private record was opened, no replacement scorer was invented, and no source was sanitized in this archival task.

This staging subset is not a complete standalone reproduction package. The scorer, original arrays, provider workspaces and private logs are absent. Public release of new generated evidence requires its own metadata/path review. Historical results and scientific limitations remain in history-notes-hrtem.json/md; copying source does not provide a new execution PASS or physical qualification.
