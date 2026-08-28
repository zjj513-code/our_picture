ALTER TABLE `photos` MODIFY COLUMN `width` int unsigned;--> statement-breakpoint
ALTER TABLE `photos` MODIFY COLUMN `height` int unsigned;--> statement-breakpoint
ALTER TABLE `photos` ADD `original_filename` varchar(255);--> statement-breakpoint
ALTER TABLE `photos` ADD `original_content_type` varchar(100);--> statement-breakpoint
ALTER TABLE `photos` ADD `original_byte_size` int unsigned;--> statement-breakpoint
ALTER TABLE `photos` ADD `checksum` char(44);--> statement-breakpoint
ALTER TABLE `photos` ADD `status` enum('pending','processing','ready','failed') DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE `photos` ADD `processing_error` text;--> statement-breakpoint
ALTER TABLE `photos` ADD `processed_at` datetime(3);--> statement-breakpoint
CREATE INDEX `idx_photos_moment_status_sort` ON `photos` (`moment_id`,`status`,`sort_order`);