ALTER TABLE `evidence` ADD `evidence_type` text DEFAULT 'OTHER' NOT NULL;--> statement-breakpoint
ALTER TABLE `evidence` ADD `scope` text DEFAULT 'DOMAIN_SPECIFIC' NOT NULL;