SELECT `t`.`category` AS `category`, SUM(CASE WHEN (`t`.`status` = 'paid') THEN `t`.`revenue` ELSE 0 END) AS `paid_sum` FROM `orders` `t` GROUP BY `t`.`category`
