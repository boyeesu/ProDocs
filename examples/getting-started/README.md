# ProDocs getting-started tutorial

Run `prodocs tutorial --output prodocs-tutorial` to create a fresh copy, or use
this checked-in example directly:

1. `prodocs sync`
2. `prodocs doctor`
3. `prodocs context --path src/delivery.js --task "change retry behavior" --json`
4. Edit `src/delivery.js`, then run `prodocs check` to observe drift.
5. Run `prodocs sync`, `prodocs policy`, and `npm test`.

The example is local-only and sends no repository data over the network.
