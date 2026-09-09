CREATE TABLE `password_reset_otps` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` INTEGER NOT NULL,
  `code_hash` CHAR(64) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `attempts` INTEGER NOT NULL DEFAULT 0,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `password_reset_otps_user_id_created_at_idx` (`user_id`, `created_at`),
  INDEX `password_reset_otps_expires_at_idx` (`expires_at`),
  PRIMARY KEY (`id`),
  CONSTRAINT `password_reset_otps_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
