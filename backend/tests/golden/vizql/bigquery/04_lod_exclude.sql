SELECT `t`.`region` AS `region`, `t`.`segment` AS `segment`, SUM(`t`.`revenue`) OVER (PARTITION BY `t`.`region`) AS `exc` FROM `sales` `t`
