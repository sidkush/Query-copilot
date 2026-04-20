SELECT COUNT(1) AS "c" FROM "sales" "t" WHERE ("t"."order_date" >= (DATE_TRUNC('month', CURRENT_TIMESTAMP) - INTERVAL '6 month'))
