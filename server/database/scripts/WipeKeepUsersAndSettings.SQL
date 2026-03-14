START TRANSACTION;

SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS truncate_except_users_and_settings;
DELIMITER $$

CREATE PROCEDURE truncate_except_users_and_settings()
BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE tname VARCHAR(255);

  DECLARE cur CURSOR FOR
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
      AND LOWER(table_name) NOT IN (
        'users',
        'organizations',
        'organizationmembers',
        'permissiongroups',
        'rolepermissions',
        'systemsettings',
        'useremailpreferences',
        'usergridpreferences',
        'projectstatusvalues',
        'taskstatusvalues',
        'taskpriorityvalues',
        'tasktypevalues',
        'ticketstatusvalues',
        'ticketpriorityvalues',
        'milestonetypevalues',
        'workflowtransitionpolicies',
        'holidays',
        'slarules',
        'organizationjiraintegrations',
        'organizationgithubintegrations',
        'organizationgiteaintegrations',
        'schemaversions'
      );

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO tname;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @sql = CONCAT('TRUNCATE TABLE `', tname, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;

  CLOSE cur;
END$$

DELIMITER ;

CALL truncate_except_users_and_settings();

DROP PROCEDURE truncate_except_users_and_settings;

SET FOREIGN_KEY_CHECKS = 1;

COMMIT;
