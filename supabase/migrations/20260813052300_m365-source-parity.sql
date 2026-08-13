CREATE OR REPLACE FUNCTION public.sync_m365_sharepoint_athrty_outbound_v1(p_integration_connection_id uuid, p_records jsonb, p_execution_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_sync_run_id uuid;

  v_now timestamptz := now();
  v_records_read int := 0;

  v_source_records_inserted int := 0;
  v_source_records_updated int := 0;
  v_source_records_unchanged int := 0;

  v_organizations_inserted int := 0;
  v_organizations_updated int := 0;
  v_organizations_reused int := 0;

  v_contacts_inserted int := 0;
  v_contacts_updated int := 0;
  v_contacts_reused int := 0;
  v_contacts_skipped int := 0;

  v_engagements_inserted int := 0;
  v_engagements_updated int := 0;
  v_engagements_reused int := 0;

  v_records_mapped int := 0;

  v_previous_source_hash text;
  v_source_classification text;

  r jsonb;
  v_brand_key text;
  v_external_site_id text;
  v_external_list_id text;
  v_external_item_id text;
  v_external_account_id text;
  v_external_lead_id text;
  v_account_name text;
  v_source_hash text;
  v_source_payload jsonb;
  v_external_dedup_key text;
  v_external_etag text;
  v_external_created_at timestamptz;
  v_external_modified_at timestamptz;

  v_org_id uuid;
  v_contact_id uuid;
  v_engagement_id uuid;

  v_contact_name text;
  v_contact_role text;
  v_verified_email text;
  v_verified_phone text;

  v_website_url text;
  v_industry text;
  v_city text;

  v_company_name text;
  v_pipeline_stage text;
  v_next_action text;
  v_follow_up_at timestamptz;
  v_raw_submission jsonb;
  v_metadata jsonb;

  v_anchor_row_id uuid;
  v_anchor_inserted boolean;
  v_anchor_resource_type text := 'sharepoint_list_item';
  v_anchor_resource_site_id text;
  v_anchor_resource_list_id text;
  v_anchor_resource_item_id text;
  v_rowcount int;
BEGIN
  IF p_integration_connection_id IS NULL THEN
    RAISE EXCEPTION 'p_integration_connection_id cannot be NULL';
  END IF;
  IF p_integration_connection_id::text <> 'f304a30c-b8c4-4d94-9860-e8634efe6b1f' THEN
    RAISE EXCEPTION 'Invalid p_integration_connection_id';
  END IF;

  IF p_records IS NULL OR jsonb_typeof(p_records) <> 'array' THEN
    RAISE EXCEPTION 'p_records must be a JSON array';
  END IF;

  v_records_read := jsonb_array_length(p_records);

  INSERT INTO public.integration_sync_runs(
    integration_connection_id,
    sync_type,
    status,
    started_at,
    records_read,
    records_written,
    records_skipped,
    execution_metadata
  )
  VALUES (
    p_integration_connection_id,
    'm365_sharepoint_athrty_outbound',
    'running',
    v_now,
    v_records_read,
    0,
    0,
    COALESCE(p_execution_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_sync_run_id;

  FOR r IN SELECT * FROM jsonb_array_elements(p_records)
  LOOP
    IF NOT (
      (r ? 'external_site_id') AND
      (r ? 'external_list_id') AND
      (r ? 'external_item_id') AND
      (r ? 'external_account_id') AND
      (r ? 'external_lead_id') AND
      (r ? 'account_name') AND
      (r ? 'brand_key') AND
      (r ? 'source_hash') AND
      (r ? 'source_payload')
    ) THEN
      RAISE EXCEPTION 'Record is missing required fields';
    END IF;

    v_external_site_id := r ->> 'external_site_id';
    v_external_list_id := r ->> 'external_list_id';
    v_external_item_id := r ->> 'external_item_id';
    v_external_account_id := r ->> 'external_account_id';
    v_external_lead_id := r ->> 'external_lead_id';
    v_account_name := r ->> 'account_name';
    v_brand_key := r ->> 'brand_key';
    v_source_hash := r ->> 'source_hash';
    v_source_payload := r -> 'source_payload';

    v_external_dedup_key := r ->> 'external_dedup_key';
    v_external_etag := r ->> 'external_etag';

    IF v_external_site_id IS NULL OR btrim(v_external_site_id) = '' THEN RAISE EXCEPTION 'external_site_id is required'; END IF;
    IF v_external_list_id IS NULL OR btrim(v_external_list_id) = '' THEN RAISE EXCEPTION 'external_list_id is required'; END IF;
    IF v_external_item_id IS NULL OR btrim(v_external_item_id) = '' THEN RAISE EXCEPTION 'external_item_id is required'; END IF;
    IF v_external_account_id IS NULL OR btrim(v_external_account_id) = '' THEN RAISE EXCEPTION 'external_account_id is required'; END IF;
    IF v_external_lead_id IS NULL OR btrim(v_external_lead_id) = '' THEN RAISE EXCEPTION 'external_lead_id is required'; END IF;
    IF v_account_name IS NULL OR btrim(v_account_name) = '' THEN RAISE EXCEPTION 'account_name is required'; END IF;
    IF v_brand_key IS NULL OR btrim(v_brand_key) = '' THEN RAISE EXCEPTION 'brand_key is required'; END IF;
    IF v_source_hash IS NULL OR btrim(v_source_hash) = '' THEN RAISE EXCEPTION 'source_hash is required'; END IF;
    IF v_source_payload IS NULL OR jsonb_typeof(v_source_payload) IS NULL OR jsonb_typeof(v_source_payload) = 'null' THEN
      RAISE EXCEPTION 'source_payload must be a non-null JSON value';
    END IF;

    IF v_external_site_id <> 'athrtysys.sharepoint.com,50b59472-e861-4e4f-8bcc-81ec8d302646,f619fbc4-04ca-47de-bd86-e6f2aab02a73' THEN
      RAISE EXCEPTION 'Invalid external_site_id';
    END IF;
    IF v_external_list_id <> '6aae0aa7-a978-4d0d-a67e-ffbbd5a11108' THEN
      RAISE EXCEPTION 'Invalid external_list_id';
    END IF;

    IF v_brand_key <> 'truett-cash' AND v_brand_key <> 'authority-systems' THEN
      RAISE EXCEPTION 'Invalid brand_key';
    END IF;

    IF (r ? 'brand_route') THEN
      IF (r->>'brand_route') <> v_brand_key THEN
        RAISE EXCEPTION 'Do not pass brand route aliases';
      END IF;
    END IF;

    IF NULLIF(btrim(r ->> 'external_created_at'), '') IS NULL THEN
      v_external_created_at := NULL;
    ELSE
      v_external_created_at := (r ->> 'external_created_at')::timestamptz;
    END IF;

    IF NULLIF(btrim(r ->> 'external_modified_at'), '') IS NULL THEN
      v_external_modified_at := NULL;
    ELSE
      v_external_modified_at := (r ->> 'external_modified_at')::timestamptz;
    END IF;

    v_contact_name := r ->> 'contact_name';
    v_contact_role := r ->> 'contact_role';
    v_verified_email := r ->> 'verified_email';
    v_verified_phone := r ->> 'verified_phone';

    v_website_url := r ->> 'website_url';
    v_industry := r ->> 'industry';
    v_city := r ->> 'city';

    v_company_name := r ->> 'account_name';
    v_pipeline_stage := NULLIF(btrim(r ->> 'pipeline_stage'), '');
    v_next_action := NULLIF(btrim(r ->> 'next_action'), '');

    IF NULLIF(btrim(r ->> 'next_action_date'), '') IS NULL THEN
      v_follow_up_at := NULL;
    ELSE
      v_follow_up_at := (r ->> 'next_action_date')::timestamptz;
    END IF;

    v_raw_submission := r;
    v_metadata := jsonb_build_object(
      'external_account_id', v_external_account_id,
      'external_lead_id', v_external_lead_id,
      'brand_key', v_brand_key
    );

    v_org_id := NULL;
    v_contact_id := NULL;
    v_engagement_id := NULL;
    v_anchor_row_id := NULL;
    v_previous_source_hash := NULL;
    v_source_classification := NULL;
    v_anchor_inserted := false;
    v_rowcount := 0;

    v_anchor_resource_site_id := v_external_site_id;
    v_anchor_resource_list_id := v_external_list_id;
    v_anchor_resource_item_id := v_external_item_id;

    INSERT INTO public.integration_source_records(
      integration_connection_id,
      provider,
      resource_type,
      external_site_id,
      external_list_id,
      external_item_id,
      external_account_id,
      external_lead_id,
      external_dedup_key,
      external_etag,
      external_created_at,
      external_modified_at,
      source_hash,
      source_payload,
      brand_key,
      last_seen_at,
      last_synced_at,
      updated_at,
      first_seen_at
    )
    VALUES (
      p_integration_connection_id,
      'microsoft_365',
      v_anchor_resource_type,
      v_external_site_id,
      v_external_list_id,
      v_external_item_id,
      v_external_account_id,
      v_external_lead_id,
      v_external_dedup_key,
      v_external_etag,
      v_external_created_at,
      v_external_modified_at,
      v_source_hash,
      v_source_payload,
      v_brand_key,
      v_now,
      v_now,
      v_now,
      v_now
    )
    ON CONFLICT ON CONSTRAINT integration_source_records_idempotent_uniq
    DO NOTHING
    RETURNING id, organization_id, contact_id, engagement_id, source_hash
    INTO v_anchor_row_id, v_org_id, v_contact_id, v_engagement_id, v_previous_source_hash;

    IF v_anchor_row_id IS NOT NULL THEN
      v_anchor_inserted := true;
      v_source_classification := 'NEW';
      v_source_records_inserted := v_source_records_inserted + 1;
    END IF;

    IF NOT v_anchor_inserted THEN
      SELECT
        id,
        source_hash,
        organization_id,
        contact_id,
        engagement_id
      FROM public.integration_source_records
      WHERE integration_connection_id = p_integration_connection_id
        AND resource_type = v_anchor_resource_type
        AND external_site_id = v_external_site_id
        AND external_list_id = v_external_list_id
        AND external_item_id = v_external_item_id
      FOR UPDATE
      INTO v_anchor_row_id, v_previous_source_hash, v_org_id, v_contact_id, v_engagement_id;

      IF v_anchor_row_id IS NULL THEN
        RAISE EXCEPTION 'source anchor resolution failed';
      END IF;

      IF v_previous_source_hash IS DISTINCT FROM v_source_hash THEN
        v_source_classification := 'CHANGED';
        v_source_records_updated := v_source_records_updated + 1;
      ELSE
        v_source_classification := 'UNCHANGED';
        v_source_records_unchanged := v_source_records_unchanged + 1;
      END IF;

      UPDATE public.integration_source_records
      SET
        external_account_id = v_external_account_id,
        external_lead_id = v_external_lead_id,
        external_dedup_key = v_external_dedup_key,
        external_etag = v_external_etag,
        external_created_at = v_external_created_at,
        external_modified_at = v_external_modified_at,
        source_hash = v_source_hash,
        source_payload = v_source_payload,
        brand_key = v_brand_key
      WHERE id = v_anchor_row_id;

      -- refresh timestamps (preserve first_seen_at and existing domain links)
      UPDATE public.integration_source_records
      SET
        last_seen_at = v_now,
        last_synced_at = v_now,
        updated_at = v_now
      WHERE id = v_anchor_row_id;
    END IF;

    -- Organization identity lock + exact reuse
    IF v_org_id IS NOT NULL AND v_source_classification = 'UNCHANGED' THEN
      v_organizations_reused := v_organizations_reused + 1;
    END IF;

    IF v_org_id IS NULL THEN
      -- Wait for concurrent updates based on deterministic tuple
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          p_integration_connection_id::text || '|' || v_brand_key || '|' || v_external_account_id,
          0
        )
      );

      SELECT organization_id
      INTO v_org_id
      FROM public.integration_source_records
      WHERE integration_connection_id = p_integration_connection_id
        AND brand_key = v_brand_key
        AND external_account_id = v_external_account_id
        AND organization_id IS NOT NULL
      LIMIT 1;

      IF v_org_id IS NOT NULL THEN
        v_organizations_reused := v_organizations_reused + 1;
      ELSE
        INSERT INTO public.organizations(
          name, website, industry, city
        )
        VALUES (
          trim(v_account_name),
          v_website_url,
          v_industry,
          v_city
        )
        RETURNING id INTO v_org_id;
        v_organizations_inserted := v_organizations_inserted + 1;
      END IF;
    END IF;

    IF v_org_id IS NOT NULL AND v_source_classification = 'CHANGED' THEN
      UPDATE public.organizations
      SET
        name = trim(v_account_name),
        website = NULLIF(trim(COALESCE(v_website_url,'')), ''),
        industry = NULLIF(trim(COALESCE(v_industry,'')), ''),
        city = NULLIF(trim(COALESCE(v_city,'')), '')
      WHERE id = v_org_id;
      v_organizations_updated := v_organizations_updated + 1;
    END IF;

    -- Contact behavior (named-contact-only)
    IF v_contact_name IS NULL OR btrim(v_contact_name) = '' THEN
      v_contacts_skipped := v_contacts_skipped + 1;
    ELSE
      -- named-contact rule remains unchanged
      IF v_contact_id IS NULL THEN
        INSERT INTO public.contacts(
          organization_id,
          first_name,
          last_name,
          email,
          phone,
          job_title,
          source
        )
        VALUES (
          v_org_id,
          trim(v_contact_name),
          NULL,
          NULLIF(trim(COALESCE(v_verified_email,'')), ''),
          NULLIF(trim(COALESCE(v_verified_phone,'')), ''),
          NULLIF(trim(COALESCE(v_contact_role,'')), ''),
          'microsoft_sharepoint_athrty_outbound'
        )
        RETURNING id INTO v_contact_id;
        v_contacts_inserted := v_contacts_inserted + 1;
      ELSIF v_source_classification = 'CHANGED' THEN
        UPDATE public.contacts
        SET
          first_name = trim(v_contact_name),
          last_name = NULL,
          email = NULLIF(trim(COALESCE(v_verified_email,'')), ''),
          phone = NULLIF(trim(COALESCE(v_verified_phone,'')), ''),
          job_title = NULLIF(trim(COALESCE(v_contact_role,'')), '')
        WHERE id = v_contact_id;
        v_contacts_updated := v_contacts_updated + 1;
      END IF;

      IF v_contact_id IS NOT NULL AND v_source_classification = 'UNCHANGED' THEN
        v_contacts_reused := v_contacts_reused + 1;
      END IF;
    END IF;

    -- Engagement behavior
    IF v_engagement_id IS NULL THEN
      IF v_pipeline_stage IS NOT NULL THEN
        INSERT INTO public.engagements(
          brand_key,
          submission_type,
          schema_version,
          source,
          company_name,
          contact_name,
          email,
          phone,
          next_action,
          follow_up_at,
          raw_submission,
          metadata,
          pipeline_stage
        )
        VALUES (
          v_brand_key,
          'm365_sharepoint_outbound',
          '1',
          'microsoft_sharepoint_athrty_outbound',
          v_company_name,
          NULLIF(v_contact_name, ''),
          NULLIF(v_verified_email, ''),
          NULLIF(v_verified_phone, ''),
          v_next_action,
          v_follow_up_at,
          v_raw_submission,
          v_metadata,
          v_pipeline_stage
        )
        RETURNING id INTO v_engagement_id;
      ELSE
        INSERT INTO public.engagements(
          brand_key,
          submission_type,
          schema_version,
          source,
          company_name,
          contact_name,
          email,
          phone,
          next_action,
          follow_up_at,
          raw_submission,
          metadata
        )
        VALUES (
          v_brand_key,
          'm365_sharepoint_outbound',
          '1',
          'microsoft_sharepoint_athrty_outbound',
          v_company_name,
          NULLIF(v_contact_name, ''),
          NULLIF(v_verified_email, ''),
          NULLIF(v_verified_phone, ''),
          v_next_action,
          v_follow_up_at,
          v_raw_submission,
          v_metadata
        )
        RETURNING id INTO v_engagement_id;
      END IF;
      v_engagements_inserted := v_engagements_inserted + 1;
    ELSIF v_source_classification = 'CHANGED' THEN
      UPDATE public.engagements
      SET
        brand_key = v_brand_key,
        company_name = v_company_name,
        contact_name = NULLIF(v_contact_name, ''),
        email = NULLIF(v_verified_email, ''),
        phone = NULLIF(v_verified_phone, ''),
        next_action = v_next_action,
        follow_up_at = v_follow_up_at,
        raw_submission = v_raw_submission,
        metadata = v_metadata,
        pipeline_stage = COALESCE(v_pipeline_stage, pipeline_stage)
      WHERE id = v_engagement_id;
      v_engagements_updated := v_engagements_updated + 1;
    ELSE
      -- UNCHANGED engagement reuse
      v_engagements_reused := v_engagements_reused + 1;
    END IF;

    -- Final source link update (verify exactly 1 row)
    UPDATE public.integration_source_records
    SET
      organization_id = COALESCE(integration_source_records.organization_id, v_org_id),
      contact_id = COALESCE(integration_source_records.contact_id, v_contact_id),
      engagement_id = COALESCE(integration_source_records.engagement_id, v_engagement_id),
      mapping_status = 'mapped',
      mapping_error_code = NULL,
      last_synced_at = v_now,
      updated_at = v_now
    WHERE id = v_anchor_row_id;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount <> 1 THEN
      RAISE EXCEPTION 'source mapping update failed';
    END IF;

    v_records_mapped := v_records_mapped + 1;

  END LOOP;

  UPDATE public.integration_sync_runs
  SET
    status = 'completed',
    completed_at = now(),
    records_written = (
      v_source_records_inserted +
      v_source_records_updated +
      v_records_mapped +
      v_organizations_inserted +
      v_organizations_updated +
      v_contacts_inserted +
      v_contacts_updated +
      v_engagements_inserted +
      v_engagements_updated
    ),
    records_skipped = v_contacts_skipped
  WHERE id = v_sync_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'sync_run_id', v_sync_run_id,
    'records_read', v_records_read,

    'source_records_inserted', v_source_records_inserted,
    'source_records_updated', v_source_records_updated,
    'source_records_unchanged', v_source_records_unchanged,

    'organizations_inserted', v_organizations_inserted,
    'organizations_updated', v_organizations_updated,
    'organizations_reused', v_organizations_reused,

    'contacts_inserted', v_contacts_inserted,
    'contacts_updated', v_contacts_updated,
    'contacts_reused', v_contacts_reused,
    'contacts_skipped', v_contacts_skipped,

    'engagements_inserted', v_engagements_inserted,
    'engagements_updated', v_engagements_updated,
    'engagements_reused', v_engagements_reused,

    'records_mapped', v_records_mapped
  );
END;
$function$;
