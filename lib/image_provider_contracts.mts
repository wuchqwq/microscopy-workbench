// Existing image composition metadata; these are not scientific result records.
export interface CompositionRecipe {
 readonly inputs: readonly string[];
 readonly outputs: readonly string[];
 readonly kind: string;
 readonly requestId?: 'required' | 'optional' | 'query' | 'none';
 readonly gates: readonly string[];
 readonly budgets: readonly string[];
}
