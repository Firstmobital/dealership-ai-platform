SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict kaa77dDvJ93vhRYj32VaMAPeeepT2z7JW3ujUqaiLP2QkoraD4Ymn9wyaeJl2KA

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."audit_log_entries" ("instance_id", "id", "payload", "created_at", "ip_address") VALUES
	('00000000-0000-0000-0000-000000000000', '08dd5504-142b-49b1-adfe-5683170d405c', '{"action":"user_signedup","actor_id":"00000000-0000-0000-0000-000000000000","actor_username":"service_role","actor_via_sso":false,"log_type":"team","traits":{"provider":"email","user_email":"manager1@techwheels.com","user_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","user_phone":""}}', '2025-11-26 06:54:49.131818+00', ''),
	('00000000-0000-0000-0000-000000000000', '584fded1-b76b-446f-b71c-567b6402c0a9', '{"action":"login","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-11-26 06:56:17.677981+00', ''),
	('00000000-0000-0000-0000-000000000000', '1e1f539a-36c0-4af9-8adc-7a7018e9554f', '{"action":"logout","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account"}', '2025-11-26 07:08:00.784233+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ccbd60be-d3d8-4092-8b7d-9163de5da708', '{"action":"user_recovery_requested","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"user"}', '2025-11-26 07:09:02.246742+00', ''),
	('00000000-0000-0000-0000-000000000000', '3b002d88-3e0e-4fc9-b8a7-7a9bc1739fef', '{"action":"login","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-11-26 07:09:25.228736+00', ''),
	('00000000-0000-0000-0000-000000000000', 'bf048df5-13c8-46cd-83ea-1e289c8efcf0', '{"action":"login","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-11-26 07:10:23.475718+00', ''),
	('00000000-0000-0000-0000-000000000000', '22b40b37-bf08-42ac-b718-1ed04effd96b', '{"action":"token_refreshed","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 08:08:25.538893+00', ''),
	('00000000-0000-0000-0000-000000000000', '2194a3b0-81e7-4918-9877-75da779bd558', '{"action":"token_revoked","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 08:08:25.545432+00', ''),
	('00000000-0000-0000-0000-000000000000', '94ac0a4b-209e-4d36-afa9-0d7ace9b9137', '{"action":"token_refreshed","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 09:36:44.625636+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ac7b24c8-74a7-472f-b3d0-03743fc28a23', '{"action":"token_revoked","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 09:36:44.629246+00', ''),
	('00000000-0000-0000-0000-000000000000', '7de83ef3-7747-4e5e-a6c5-9e3b5d0eb872', '{"action":"token_refreshed","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 10:00:30.535673+00', ''),
	('00000000-0000-0000-0000-000000000000', '6ae2d32c-6775-4750-b976-abe5cb776c81', '{"action":"token_revoked","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 10:00:30.541328+00', ''),
	('00000000-0000-0000-0000-000000000000', '2f21c5d7-54c6-45b3-8cfb-b1e9fd009480', '{"action":"logout","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account"}', '2025-11-26 10:00:33.130269+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c2a166c9-b0d6-4f2e-a4ed-6bd242772730', '{"action":"login","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-11-26 10:00:42.751535+00', ''),
	('00000000-0000-0000-0000-000000000000', 'e533a403-30fd-4dbf-b5bc-7f9cd2c816ed', '{"action":"token_refreshed","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 11:18:51.10131+00', ''),
	('00000000-0000-0000-0000-000000000000', 'a01fd8b2-6635-44e7-9101-c9e096081d2f', '{"action":"token_revoked","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-11-26 11:18:51.103897+00', ''),
	('00000000-0000-0000-0000-000000000000', 'c9108afd-0348-44b4-b2f2-251e655a9813', '{"action":"login","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"account","traits":{"provider":"email"}}', '2025-12-02 06:55:22.364927+00', ''),
	('00000000-0000-0000-0000-000000000000', 'ea0b17af-13a5-47aa-b810-33a8a269d857', '{"action":"token_refreshed","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-12-02 08:02:19.972206+00', ''),
	('00000000-0000-0000-0000-000000000000', 'd70184ba-c05a-4abe-9971-b6835c012ff5', '{"action":"token_revoked","actor_id":"d68c5a7e-13eb-4f7e-9661-8dbac056a5ec","actor_username":"manager1@techwheels.com","actor_via_sso":false,"log_type":"token"}', '2025-12-02 08:02:19.974271+00', '');


--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'authenticated', 'authenticated', 'manager1@techwheels.com', '$2a$10$eT.JiDfWUwUo/9Wg9OvD0.0tZKSIIwjx3KVW/y8.UKat6GdFMzch.', '2025-11-26 06:54:49.134211+00', NULL, '', NULL, 'a8183cc7c5b9e09840a9881cf0ccd8130c3199e1d1197ec40b6ada1b', '2025-11-26 07:09:02.252248+00', '', '', NULL, '2025-12-02 06:55:22.368972+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2025-11-26 06:54:49.124549+00', '2025-12-02 08:02:19.97706+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('d68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', '{"sub": "d68c5a7e-13eb-4f7e-9661-8dbac056a5ec", "email": "manager1@techwheels.com", "email_verified": false, "phone_verified": false}', 'email', '2025-11-26 06:54:49.129531+00', '2025-11-26 06:54:49.129561+00', '2025-11-26 06:54:49.129561+00', '5c785f7c-64ff-4767-86ea-af38d735a60e');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('34198fcf-d31f-4cbe-b9ba-3e2f920e1142', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', '2025-11-26 10:00:42.753188+00', '2025-11-26 11:18:51.110052+00', NULL, 'aal1', NULL, '2025-11-26 11:18:51.110003', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', '192.168.65.1', NULL, NULL, NULL, NULL, NULL),
	('05313901-c06a-49d9-b192-77d3effa28e9', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', '2025-12-02 06:55:22.369372+00', '2025-12-02 08:02:19.977986+00', NULL, 'aal1', NULL, '2025-12-02 08:02:19.977932', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36', '172.18.0.1', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('34198fcf-d31f-4cbe-b9ba-3e2f920e1142', '2025-11-26 10:00:42.759896+00', '2025-11-26 10:00:42.759896+00', 'password', 'f80734a1-9b09-4358-baf1-94f173289589'),
	('05313901-c06a-49d9-b192-77d3effa28e9', '2025-12-02 06:55:22.38078+00', '2025-12-02 06:55:22.38078+00', 'password', 'd71463d4-00f2-4eb7-a160-ecda5c6bff1d');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."one_time_tokens" ("id", "user_id", "token_type", "token_hash", "relates_to", "created_at", "updated_at") VALUES
	('5442a334-5889-4f5d-9178-8a068239bb19', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'recovery_token', 'a8183cc7c5b9e09840a9881cf0ccd8130c3199e1d1197ec40b6ada1b', 'manager1@techwheels.com', '2025-11-26 07:09:02.293408', '2025-11-26 07:09:02.293408');


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 7, 'eabmwftcx2qw', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', true, '2025-11-26 10:00:42.75581+00', '2025-11-26 11:18:51.104276+00', NULL, '34198fcf-d31f-4cbe-b9ba-3e2f920e1142'),
	('00000000-0000-0000-0000-000000000000', 8, '3quuwsz4fv2z', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', false, '2025-11-26 11:18:51.105787+00', '2025-11-26 11:18:51.105787+00', 'eabmwftcx2qw', '34198fcf-d31f-4cbe-b9ba-3e2f920e1142'),
	('00000000-0000-0000-0000-000000000000', 9, '5rbyc4ls7g4t', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', true, '2025-12-02 06:55:22.376312+00', '2025-12-02 08:02:19.97469+00', NULL, '05313901-c06a-49d9-b192-77d3effa28e9'),
	('00000000-0000-0000-0000-000000000000', 10, 'm3flc6rhw6bw', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', false, '2025-12-02 08:02:19.976191+00', '2025-12-02 08:02:19.976191+00', '5rbyc4ls7g4t', '05313901-c06a-49d9-b192-77d3effa28e9');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: organizations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organizations" ("id", "name", "logo_url", "type", "created_at", "parent_org_id") VALUES
	('98f22145-69be-4928-a5d2-9b095a134b9c', 'Techwheels Motors', NULL, 'dealership', '2025-11-26 06:53:37.764021+00', NULL),
	('e7060ac1-36fa-4b60-85bb-fc6049a20f7f', 'Tata Motors', NULL, 'dealership', '2025-11-26 06:53:37.764021+00', NULL),
	('041c6ff0-e3f0-435f-b0ed-e101aa269239', 'Techwheels Division A', NULL, 'division', '2025-11-26 06:55:54.240063+00', '98f22145-69be-4928-a5d2-9b095a134b9c'),
	('1699c9d9-7be4-4b77-85b0-825681984d3f', 'test', NULL, 'division', '2025-11-26 07:15:35.496106+00', '98f22145-69be-4928-a5d2-9b095a134b9c');


--
-- Data for Name: bot_instructions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: bot_personality; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: contacts; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: campaign_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: knowledge_articles; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: knowledge_chunks; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: organization_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."organization_users" ("id", "organization_id", "user_id", "role", "created_at") VALUES
	('63dbe4e7-1dfa-4f53-949b-d3c05fd5cdb9', '98f22145-69be-4928-a5d2-9b095a134b9c', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'admin', '2025-11-26 06:55:32.204084+00'),
	('b950e82a-59e0-4611-a1b0-c1c44a5225cc', '98f22145-69be-4928-a5d2-9b095a134b9c', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'admin', '2025-11-26 07:07:40.597844+00'),
	('a55db553-a39b-4e76-99b6-da3bf8465076', 'e7060ac1-36fa-4b60-85bb-fc6049a20f7f', 'd68c5a7e-13eb-4f7e-9661-8dbac056a5ec', 'admin', '2025-11-26 07:07:40.597844+00');


--
-- Data for Name: unanswered_questions; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: whatsapp_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."whatsapp_settings" ("id", "organization_id", "phone_number", "api_token", "verify_token", "whatsapp_phone_id", "whatsapp_business_id", "is_active", "created_at", "updated_at", "sub_organization_id") VALUES
	('8343b246-c072-41b0-8891-15f56fc37b34', '98f22145-69be-4928-a5d2-9b095a134b9c', '15551388640', 'EAAP6JblRfvYBP8jZAgSdKU451KeaQZBzZACZCSocLx8G705KuJO62oUHq1XmRi37GwkjmskxeHER46E9QZAmN49HSZA7P7qvXwypRFjZBVFrl5bpLxriDPnE3H97p2h5mR3A9VDPOGtqjWHsHiL9mgSP1Ev5uWS7pkUVmMfe6IlRq7JBZAE3GPZBzQluUSaCuDAaqGQZDZD', 'techwheels_meta_verify_123', '812818845255523', '1914822519403635', true, '2025-11-26 07:25:37.145762+00', '2025-11-26 07:25:37.145762+00', NULL),
	('77e7376a-8390-4aa6-a563-ac9ef7a0c071', '98f22145-69be-4928-a5d2-9b095a134b9c', '15551388640', 'EAAP6JblRfvYBP8jZAgSdKU451KeaQZBzZACZCSocLx8G705KuJO62oUHq1XmRi37GwkjmskxeHER46E9QZAmN49HSZA7P7qvXwypRFjZBVFrl5bpLxriDPnE3H97p2h5mR3A9VDPOGtqjWHsHiL9mgSP1Ev5uWS7pkUVmMfe6IlRq7JBZAE3GPZBzQluUSaCuDAaqGQZDZD', 'techwheels_meta_verify_123', '812818845255523', '1914822519403635', true, '2025-11-26 07:29:18.50811+00', '2025-11-26 07:29:18.50811+00', '041c6ff0-e3f0-435f-b0ed-e101aa269239');


--
-- Data for Name: workflows; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workflow_steps; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: workflow_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_namespaces; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: iceberg_tables; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: prefixes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: hooks; Type: TABLE DATA; Schema: supabase_functions; Owner: supabase_functions_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 10, true);


--
-- Name: hooks_id_seq; Type: SEQUENCE SET; Schema: supabase_functions; Owner: supabase_functions_admin
--

SELECT pg_catalog.setval('"supabase_functions"."hooks_id_seq"', 1, false);


--
-- PostgreSQL database dump complete
--

-- \unrestrict kaa77dDvJ93vhRYj32VaMAPeeepT2z7JW3ujUqaiLP2QkoraD4Ymn9wyaeJl2KA

RESET ALL;
