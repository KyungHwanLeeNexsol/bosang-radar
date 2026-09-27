CREATE TABLE `consultation_rate_limits` (
	`window_start` integer NOT NULL,
	`ip_hmac` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consultation_rate_limits_window_ip_unique` ON `consultation_rate_limits` (`window_start`,`ip_hmac`);--> statement-breakpoint
CREATE TABLE `consultations` (
	`id` text PRIMARY KEY NOT NULL,
	`result_id` text NOT NULL,
	`channel` text NOT NULL,
	`name` text NOT NULL,
	`contact_normalized` text NOT NULL,
	`preferred_call_time` text,
	`consent_pii_collection` integer NOT NULL,
	`consent_health_info_use` integer NOT NULL,
	`consent_marketing` integer NOT NULL,
	`consent_version` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`application_status` text DEFAULT 'received' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consultations_idempotency_key_unique` ON `consultations` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `consultations_result_contact_unique` ON `consultations` (`result_id`,`contact_normalized`);