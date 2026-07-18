/**
 * File-backed and package-process scenarios intentionally run alone. They exercise
 * shared SQLite locking, durable restart behavior, or a child server process; the
 * remaining Gym scenarios own only in-memory fixtures and can use bounded workers.
 */
export const gymSequentialTestFiles = [
    "tests/server/administrators_build_select_and_reuse_immutable_agent_images.test.ts",
    "tests/server/administrators_change_agent_images_and_replace_running_environments.test.ts",
    "tests/server/administrators_discover_select_and_resume_sandbox_providers.test.ts",
    "tests/server/administrators_select_build_retry_and_resume_onboarding_base_images.test.ts",
    "tests/server/agent_creation_retries_transient_docker_desktop_bind_propagation.test.ts",
    "tests/server/agent_image_build_logs_stream_progress_and_survive_restarts.test.ts",
    "tests/server/channel_audiences_share_one_durable_agent_session_with_bounded_context.test.ts",
    "tests/server/concurrent_bootstrap_registration_allows_exactly_one_account.test.ts",
    "tests/server/fresh_server_onboarding_resumes_and_controls_registration.test.ts",
    "tests/server/package_runner_serves_web_proxies_api_and_owns_a_private_rig.test.ts",
    "tests/state/agent_turns_reconcile_through_the_real_server_and_rig_queue.test.ts",
    "tests/state/channel_composer_audience_and_default_agent_cross_the_real_state_boundary.test.ts",
    "tests/state/setup_onboarding_crosses_the_real_state_and_server_boundary.test.ts",
    "tests/state/streamed_agent_markdown_reconciles_as_one_durable_message.test.ts",
] as const;
