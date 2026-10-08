"""Run against the disposable PostgreSQL service in cloud CI."""
import subprocess
from concurrent.futures import ThreadPoolExecutor


def sql(query, check=True):
    return subprocess.run(['psql', '-v', 'ON_ERROR_STOP=1', '-Atqc', query], check=check, text=True, capture_output=True)


for role in ('anon', 'authenticated'):
    assert sql(f'SET ROLE {role}; SELECT public.reserve_chirp_characters(1)', check=False).returncode != 0
    assert sql(f'SET ROLE {role}; SELECT * FROM public.chirp_speech_usage', check=False).returncode != 0

for count in ('0', '-1', '5001', 'NULL'):
    assert sql(f'SET ROLE service_role; SELECT public.reserve_chirp_characters({count})').stdout.strip() == 'f'

sql("INSERT INTO public.chirp_speech_usage (month, characters) VALUES (date_trunc('month', now() AT TIME ZONE 'America/Los_Angeles')::date, 999999)")
with ThreadPoolExecutor(max_workers=2) as pool:
    answers = list(pool.map(lambda _: sql('SET ROLE service_role; SELECT public.reserve_chirp_characters(1)').stdout.strip(), range(2)))
assert sorted(answers) == ['f', 't'], answers
assert sql('SELECT characters FROM public.chirp_speech_usage').stdout.strip() == '1000000'
assert sql('SET ROLE service_role; SELECT public.reserve_chirp_characters(1)').stdout.strip() == 'f'
print('Anonymous access denied; concurrent reservations respect the monthly cap.')
