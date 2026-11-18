\echo
\echo '######## RESULTS ########'
SELECT n, name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, left(detail, 140) AS detail FROM t.res ORDER BY n;
SELECT count(*) FILTER (WHERE ok) AS passed, count(*) FILTER (WHERE NOT ok) AS failed FROM t.res;
