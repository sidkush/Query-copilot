SELECT SUM("t"."revenue") OVER (PARTITION BY "t"."region" ORDER BY "t"."order_date" ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS "rsum" FROM "sales" "t"
