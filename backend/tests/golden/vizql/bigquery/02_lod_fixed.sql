SELECT `t`.`region` AS `region`, (SELECT SUM(`s`.`revenue`) AS `fx` FROM `sales` `s` GROUP BY `s`.`region`) AS `fx` FROM `sales` `t` GROUP BY `t`.`region`
