function violation(policy, node, message, severity = "error") {
  return {
    policy,
    severity,
    node: node.id,
    path: node.path,
    message
  };
}

export function evaluatePolicies(graph, config) {
  const violations = [];
  const inbound = new Map();
  for (const edge of graph.edges) {
    const values = inbound.get(edge.to) ?? [];
    values.push(edge);
    inbound.set(edge.to, values);
  }

  for (const node of graph.nodes) {
    if (node.type === "file" && node.publicSurface) {
      if (config.policies.publicSurfaceRequiresOwner && !node.owner) {
        violations.push(
          violation(
            "public-surface-owner",
            node,
            "Public surfaces require an owner."
          )
        );
      }
      if (
        config.policies.publicSurfaceRequiresClaim &&
        !(inbound.get(node.id) ?? []).some(
          (edge) =>
            edge.type === "supported-by" &&
            ["claim", "feature"].some((type) => edge.from.startsWith(`${type}:`))
        )
      ) {
        violations.push(
          violation(
            "public-surface-claim",
            node,
            "Public surfaces require an evidence-backed claim or feature."
          )
        );
      }
    }
    if (
      config.policies.claimRequiresEvidence &&
      ["claim", "invariant", "feature"].includes(node.type) &&
      (node.evidence.length === 0 ||
        node.evidence.some((reference) => !reference.supported))
    ) {
      violations.push(
        violation(
          "claim-evidence",
          node,
          "Authored claims, invariants, and features require resolvable evidence."
        )
      );
    }
    if (
      config.policies.runbookRequiresVerification &&
      node.type === "runbook" &&
      node.verification.length === 0
    ) {
      violations.push(
        violation(
          "runbook-verification",
          node,
          "Runbooks require at least one structured verification step."
        )
      );
    }
  }

  return {
    schemaVersion: 1,
    kind: "prodocs.policy-report",
    sourceHash: graph.sourceHash,
    knowledgeHash: graph.knowledgeHash,
    passed: violations.length === 0,
    counts: {
      errors: violations.filter((item) => item.severity === "error").length,
      warnings: violations.filter((item) => item.severity === "warning").length
    },
    violations
  };
}
