CREATE TABLE `gemini_request_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`method` text NOT NULL,
	`model` text NOT NULL,
	`status` integer,
	`ok` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `case_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
