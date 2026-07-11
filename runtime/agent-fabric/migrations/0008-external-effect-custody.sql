-- Spec 01 v0.13 / Spec 04 v1.9 / Spec 05 v1.1 registered external-effect custody.

CREATE TABLE operator_external_effect_bindings (
  custody_id TEXT PRIMARY KEY REFERENCES operator_effect_custody(custody_id),
  effect_kind TEXT NOT NULL CHECK (effect_kind IN ('registered-external-effect','promotion')),
  integration_id TEXT NOT NULL CHECK (length(integration_id) BETWEEN 1 AND 256),
  integration_generation INTEGER NOT NULL CHECK (integration_generation >= 1),
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 256),
  contract_digest TEXT NOT NULL,
  target_id TEXT NOT NULL CHECK (length(target_id) BETWEEN 1 AND 512),
  target_revision INTEGER NOT NULL CHECK (target_revision >= 1),
  request_artifact_path TEXT NOT NULL CHECK (length(request_artifact_path) BETWEEN 1 AND 4096),
  request_artifact_digest TEXT NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 512),
  release_gate_id TEXT REFERENCES scoped_gates(gate_id),
  release_gate_revision INTEGER CHECK (release_gate_revision IS NULL OR release_gate_revision >= 1),
  release_binding_digest TEXT,
  lookup_generation INTEGER NOT NULL DEFAULT 0 CHECK (lookup_generation >= 0),
  lookup_evidence_digest TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (integration_id, idempotency_key),
  CHECK (length(contract_digest)=71 AND substr(contract_digest,1,7)='sha256:'),
  CHECK (length(request_artifact_digest)=71 AND substr(request_artifact_digest,1,7)='sha256:'),
  CHECK (
    (effect_kind='registered-external-effect'
      AND release_gate_id IS NULL
      AND release_gate_revision IS NULL
      AND release_binding_digest IS NULL) OR
    (effect_kind='promotion'
      AND release_gate_id IS NOT NULL
      AND release_gate_revision IS NOT NULL
      AND release_binding_digest IS NOT NULL)
  ),
  CHECK (
    release_binding_digest IS NULL OR
    (length(release_binding_digest)=71 AND substr(release_binding_digest,1,7)='sha256:')
  ),
  CHECK (
    (lookup_generation=0 AND lookup_evidence_digest IS NULL) OR
    (lookup_generation>0 AND lookup_evidence_digest IS NOT NULL
      AND length(lookup_evidence_digest)=71
      AND substr(lookup_evidence_digest,1,7)='sha256:')
  )
);

CREATE INDEX operator_external_effect_bindings_recovery
  ON operator_external_effect_bindings(lookup_generation, custody_id);

CREATE TRIGGER operator_external_effect_binding_insert_guard
BEFORE INSERT ON operator_external_effect_bindings
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM operator_effect_custody custody
     WHERE custody.custody_id=NEW.custody_id
       AND custody.state='prepared'
       AND custody.operation='external-effect'
       AND json_valid(custody.intent_json)=1
       AND json_extract(custody.intent_json, '$.kind')=NEW.effect_kind
  ) THEN RAISE(ABORT, 'INVARIANT_external_effect_parent') END;

  SELECT CASE WHEN NEW.effect_kind='registered-external-effect' AND NOT EXISTS (
    SELECT 1 FROM operator_effect_custody custody
     WHERE custody.custody_id=NEW.custody_id
       AND json_extract(custody.intent_json, '$.integrationId')=NEW.integration_id
       AND json_extract(custody.intent_json, '$.expectedIntegrationGeneration')=NEW.integration_generation
       AND json_extract(custody.intent_json, '$.operationId')=NEW.operation_id
       AND json_extract(custody.intent_json, '$.contractDigest')=NEW.contract_digest
       AND json_extract(custody.intent_json, '$.targetId')=NEW.target_id
       AND json_extract(custody.intent_json, '$.expectedTargetRevision')=NEW.target_revision
       AND json_extract(custody.intent_json, '$.requestArtifactRef.path')=NEW.request_artifact_path
       AND json_extract(custody.intent_json, '$.requestArtifactRef.digest')=NEW.request_artifact_digest
       AND json_extract(custody.intent_json, '$.idempotencyKey')=NEW.idempotency_key
  ) THEN RAISE(ABORT, 'INVARIANT_external_effect_intent_binding') END;

  SELECT CASE WHEN NEW.effect_kind='promotion' AND NOT EXISTS (
    SELECT 1
      FROM operator_effect_custody custody
      JOIN scoped_gates gate ON gate.gate_id=NEW.release_gate_id
     WHERE custody.custody_id=NEW.custody_id
       AND gate.project_session_id=custody.project_session_id
       AND gate.scope_kind='release'
       AND gate.status='approved'
       AND gate.revision=NEW.release_gate_revision
       AND json_extract(custody.intent_json, '$.gateId')=NEW.release_gate_id
       AND json_extract(custody.intent_json, '$.expectedGateRevision')=NEW.release_gate_revision
       AND json_extract(custody.intent_json, '$.releaseBinding.acceptedDeliveryReceiptRef.path')=NEW.request_artifact_path
       AND json_extract(custody.intent_json, '$.releaseBinding.acceptedDeliveryReceiptRef.digest')=NEW.request_artifact_digest
       AND json_extract(custody.intent_json, '$.releaseBinding.promotionAction')=NEW.operation_id
       AND json_extract(custody.intent_json, '$.releaseBinding.target')=NEW.target_id
       AND json_extract(gate.release_binding_json, '$.acceptedDeliveryReceiptRef.path')=NEW.request_artifact_path
       AND json_extract(gate.release_binding_json, '$.acceptedDeliveryReceiptRef.digest')=NEW.request_artifact_digest
       AND json_extract(gate.release_binding_json, '$.promotionAction')=NEW.operation_id
       AND json_extract(gate.release_binding_json, '$.target')=NEW.target_id
  ) THEN RAISE(ABORT, 'INVARIANT_promotion_release_binding') END;
END;

CREATE TRIGGER operator_external_effect_binding_identity_immutable
BEFORE UPDATE OF
  custody_id, effect_kind, integration_id, integration_generation, operation_id,
  contract_digest, target_id, target_revision, request_artifact_path,
  request_artifact_digest, idempotency_key, release_gate_id,
  release_gate_revision, release_binding_digest, created_at
ON operator_external_effect_bindings
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_external_effect_binding_immutable');
END;

CREATE TRIGGER operator_external_effect_binding_lookup_cas
BEFORE UPDATE OF lookup_generation, lookup_evidence_digest
ON operator_external_effect_bindings
WHEN NEW.lookup_generation<>OLD.lookup_generation+1
  OR NEW.lookup_evidence_digest IS NULL
  OR length(NEW.lookup_evidence_digest)<>71
  OR substr(NEW.lookup_evidence_digest,1,7)<>'sha256:'
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_external_effect_lookup_cas');
END;

CREATE TRIGGER operator_external_effect_binding_delete_forbidden
BEFORE DELETE ON operator_external_effect_bindings
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_external_effect_binding_immutable');
END;

CREATE TRIGGER operator_external_effect_requires_typed_binding
BEFORE UPDATE OF state ON operator_effect_custody
WHEN json_valid(OLD.intent_json)=1
 AND json_extract(OLD.intent_json, '$.kind') IN ('registered-external-effect','promotion')
 AND NOT EXISTS (
   SELECT 1 FROM operator_external_effect_bindings binding
    WHERE binding.custody_id=OLD.custody_id
 )
BEGIN
  SELECT RAISE(ABORT, 'INVARIANT_external_effect_binding_required');
END;

CREATE TRIGGER global_revision_operator_external_effect_binding_insert
AFTER INSERT ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;

CREATE TRIGGER global_revision_operator_external_effect_binding_update
AFTER UPDATE ON operator_external_effect_bindings
BEGIN UPDATE daemon_global_state SET revision=revision+1 WHERE singleton=1; END;
