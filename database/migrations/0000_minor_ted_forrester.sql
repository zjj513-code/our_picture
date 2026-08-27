CREATE TABLE `moments` (
	`id` varchar(36) NOT NULL,
	`date` date NOT NULL,
	`title` varchar(160),
	`location` varchar(160),
	`caption` text,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`published_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `moments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` varchar(36) NOT NULL,
	`moment_id` varchar(36) NOT NULL,
	`original_key` varchar(512) NOT NULL,
	`web_key` varchar(512) NOT NULL,
	`thumbnail_key` varchar(512),
	`width` int unsigned NOT NULL,
	`height` int unsigned NOT NULL,
	`alt_text` varchar(500),
	`sort_order` int unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `photos_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_photos_moment_sort_order` UNIQUE(`moment_id`,`sort_order`)
);
--> statement-breakpoint
ALTER TABLE `photos` ADD CONSTRAINT `photos_moment_id_moments_id_fk` FOREIGN KEY (`moment_id`) REFERENCES `moments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_moments_status_date` ON `moments` (`status`,`date`);