#!/usr/bin/env python3
"""Fixed Wanwu-only applier, used by the bounded dispatcher or an existing root SSH operator."""
import argparse
import fcntl
import json
import math
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from controller_codec import read_key, timestamp, write_signed

ROOT = pathlib.Path('/etc/wanwu-sound')
CONFIG = pathlib.Path('/srv/wudaizii/wanwu-sound/configuration')
STARTUP = {'WANWU_APP_ORIGIN', 'WANWU_CLOUD_AUTH_MODE', 'WANWU_TRUSTED_PROXY_ADDRESSES',
           'WANWU_DATABASE_URL', 'WANWU_SESSION_SECRET', 'WANWU_OSS_BUCKET', 'WANWU_OSS_REGION',
           'WANWU_OSS_PREFIX', 'WANWU_OSS_ACCESS_KEY_ID', 'WANWU_OSS_ACCESS_KEY_SECRET',
           'WANWU_DATABASE_POOLMAX', 'WANWU_DATABASE_CONNECTMS', 'WANWU_DATABASE_STATEMENTMS'}

def deployment_values(values):
    bounds = {
        'deploy.logMiB': (1,100), 'deploy.logFiles': (1,10),
        'deploy.applyIntervalSeconds': (10,3600), 'deploy.postgresConnections': (20,80),
        'deploy.postgresBuffersMiB': (32,256), 'schedule.backupHour': (0,23),
        'schedule.backupMinute': (0,59), 'schedule.backupJitterSeconds': (0,600),
        'schedule.cleanupMinutes': (15,1440), 'schedule.storageMinutes': (5,1440),
        'schedule.healthMinutes': (1,60), 'proxy.connectSeconds': (1,10),
        'proxy.defaultReadSeconds': (10,60), 'proxy.discoveryReadSeconds': (49,90),
        'proxy.featuresReadSeconds': (13,60),
    }
    for name,minimum,maximum,pids in [('api',256,1024,128),('media',1024,2048,256),('database',512,1024,128)]:
        bounds['deploy.'+name+'.cpu'] = (.1,2)
        bounds['deploy.'+name+'.memoryMiB'] = (minimum,maximum)
        bounds['deploy.'+name+'.pids'] = (pids,512)
    for key,(minimum,maximum) in bounds.items():
        value=values.get(key)
        if type(value) not in (int,float) or not math.isfinite(value) or not minimum <= value <= maximum or (not key.endswith('.cpu') and type(value) is not int):
            raise RuntimeError('Deployment setting exceeds reviewed bounds')
    return {key:values[key] for key in bounds}

def run(args, timeout=60):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout,
                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'})
    if result.returncode:
        raise RuntimeError('Wanwu operation failed; command output suppressed')
    return result.stdout

def private(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise RuntimeError('Root-owned private operation file required')

def write(path, data):
    fd, name = tempfile.mkstemp(prefix='.site-configuration-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            os.fchmod(file.fileno(), 0o600)
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name): os.unlink(name)

def env_text(values):
    rows = []
    for key, value in values.items():
        if not re.fullmatch(r'WANWU_[A-Z0-9_]+', key) or not isinstance(value, (str, int, float)):
            raise RuntimeError('Unsupported environment field')
        value = str(value)
        if any(c in value for c in '\r\n\0'):
            raise RuntimeError('Multiline configuration refused')
        rows.append(key + '=' + value)
    return '\n'.join(rows) + '\n'

def health(url):
    with urllib.request.urlopen(url, timeout=10) as response:
        if response.status != 200: raise RuntimeError('Health check failed')

def target(url):
    value = urllib.parse.urlsplit(url)
    return value.scheme, value.hostname, value.port, value.username, value.path

def make_override(values, directory=ROOT):
    deployment_values(values)
    services = {}
    for name in ['api', 'media', 'database']:
        cpu, memory, pids = (values['deploy.' + name + '.' + key] for key in ['cpu', 'memoryMiB', 'pids'])
        if not all(isinstance(n, (int, float)) and math.isfinite(n) for n in [cpu, memory, pids]):
            raise RuntimeError('Invalid resource value')
        if not .1 <= cpu <= 2 or not 256 <= memory <= 2048 or not 128 <= pids <= 512:
            raise RuntimeError('Resource safety bounds exceeded')
        services[name] = {'cpus': cpu, 'mem_limit': str(memory) + 'm', 'memswap_limit': str(memory) + 'm', 'pids_limit': pids,
                          'logging': {'driver': 'json-file', 'options': {'max-size': str(values['deploy.logMiB']) + 'm', 'max-file': str(values['deploy.logFiles'])}}}
    services['database']['command'] = ['postgres', '-c', 'shared_buffers=' + str(values['deploy.postgresBuffersMiB']) + 'MB', '-c', 'max_connections=' + str(values['deploy.postgresConnections'])]
    for name in ['api', 'media', 'ops']:
        services.setdefault(name, {})['env_file'] = [{'path': str(directory / ('.env.site-' + name)), 'format': 'raw'}]
    return {'services': services}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--expected-revision', type=int)
    args = parser.parse_args()
    if os.geteuid() != 0 or not ROOT.is_dir() or ROOT.is_symlink() or ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o022:
        raise RuntimeError('Wanwu root operator context required')
    for name in ['.env.release', '.env.api', '.env.worker', '.env.ops', 'compose.yml']:
        private(ROOT / name)
    inspect = json.loads(run(['/usr/bin/docker', 'inspect', 'wanwu-sound-api-1']))[0]
    labels = inspect['Config'].get('Labels', {})
    if labels.get('com.docker.compose.project') != 'wanwu-sound' or not inspect['HostConfig']['ReadonlyRootfs']:
        raise RuntimeError('Isolated Wanwu API required')
    snapshot = json.loads(run(['/usr/bin/docker', 'exec', '-w', '/app', 'wanwu-sound-api-1', 'node', 'apps/api/src/settings/export-cli.ts', '--private-pipe']))
    values, environment = snapshot['values'], snapshot['environment']
    applied = deployment_values(values)
    baseline = snapshot['startupEnvironment']
    if set(baseline) != STARTUP or not STARTUP.issubset(environment):
        raise RuntimeError('Unexpected startup field set')
    environment = {key:environment[key] for key in STARTUP}
    if args.expected_revision is not None and snapshot['revision'] != args.expected_revision:
        raise RuntimeError('Configuration revision changed before application')
    for field in ['WANWU_OSS_BUCKET', 'WANWU_OSS_REGION', 'WANWU_OSS_PREFIX', 'WANWU_APP_ORIGIN']:
        if environment.get(field) != baseline.get(field):
            raise RuntimeError('Storage target or Origin change requires a separately verified migration / DNS-TLS-CORS procedure')
    if target(environment.get('WANWU_DATABASE_URL', '')) != target(baseline.get('WANWU_DATABASE_URL', '')):
        raise RuntimeError('Changing the database target requires an explicit migration procedure')
    files = [pathlib.Path(p) for p in labels['com.docker.compose.project.config_files'].split(',')]
    if any(p.parent != ROOT for p in files): raise RuntimeError('Unreviewed Compose path refused')
    for file in files: private(file)
    if CONFIG.is_symlink() or not CONFIG.is_dir() or CONFIG.stat().st_mode & 0o077:
        raise RuntimeError('A private Wanwu configuration directory is required')
    override = ROOT / 'site-configuration.compose.json'
    files = list(dict.fromkeys([*files, override]))
    command = ['/usr/bin/docker', 'compose', '--project-name', 'wanwu-sound', '--project-directory', str(ROOT), '--env-file', str(ROOT / '.env.release')]
    for file in files: command.extend(['--file', str(file)])
    plan = {'revision': snapshot['revision'], 'mode': 'apply' if args.apply else 'plan',
            'services': ['api', 'media', 'database'], 'targets': 'wanwu-only',
            'restartFields': [key for key in environment if key in baseline and environment[key] != baseline[key]],
            'resourceSettings': {k:v for k,v in values.items() if k.startswith(('deploy.', 'schedule.', 'proxy.'))}}
    print(json.dumps(plan, ensure_ascii=False))
    if not args.apply: return
    mem = {line.split(':')[0]: int(line.split()[1]) for line in pathlib.Path('/proc/meminfo').read_text().splitlines() if ':' in line}
    if mem['MemAvailable'] < 2621440 or shutil.disk_usage('/srv/wudaizii/wanwu-sound').free < 8 * 1024**3:
        raise RuntimeError('Shared-host memory or disk reserve not met')
    containers = json.loads(run(['/usr/bin/docker','inspect','wanwu-sound-api-1','wanwu-sound-media-1','wanwu-sound-database-1']))
    current_memory = sum(c['HostConfig']['Memory'] for c in containers)
    requested_memory = sum(values['deploy.'+name+'.memoryMiB'] for name in ['api','media','database']) * 1024**2
    if mem['MemAvailable'] * 1024 - max(0,requested_memory-current_memory) < 2621440 * 1024:
        raise RuntimeError('Requested memory would consume the shared-host reserve')
    if values['deploy.postgresConnections'] * 8 + values['deploy.postgresBuffersMiB'] + 128 > values['deploy.database.memoryMiB']:
        raise RuntimeError('PostgreSQL connection/buffer budget exceeds its memory allocation')
    if sum(values['deploy.'+name+'.cpu'] for name in ['api','media','database']) > max(1, (os.cpu_count() or 2) / 2):
        raise RuntimeError('CPU allocation would exceed the shared-host budget')
    active = run(['/usr/bin/docker','exec','wanwu-sound-database-1','psql','-U','wanwu_owner','-d','wanwu_sound','-Atc',"SELECT (SELECT count(*) FROM wanwu_jobs.job WHERE name='media' AND state='active')+(SELECT count(*) FROM ai_call_leases WHERE expires_at>now())"]).strip()
    if active != '0': raise RuntimeError('Wait for active Wanwu media / model tasks before applying')
    health('https://proterm.ink/')
    new_files = {
      ROOT / '.env.site-api': env_text(environment),
      ROOT / '.env.site-media': env_text({k:v for k,v in environment.items() if k.startswith('WANWU_DATABASE_') or k in ['WANWU_APP_ORIGIN','WANWU_OSS_BUCKET','WANWU_OSS_REGION','WANWU_OSS_PREFIX','WANWU_OSS_ACCESS_KEY_ID','WANWU_OSS_ACCESS_KEY_SECRET']}),
      ROOT / '.env.site-ops': env_text({k:v for k,v in environment.items() if k.startswith('WANWU_DATABASE_')}),
      override: json.dumps(make_override(values), indent=2)+'\n',
    }
    maintenance = ROOT/'maintenance'
    for name in ['api','media','ops']: new_files[maintenance/('.env.site-'+name)] = new_files[ROOT/('.env.site-'+name)]
    new_files[maintenance/'site-configuration.compose.json'] = json.dumps(make_override(values,maintenance),indent=2)+'\n'
    desired_services=make_override(values)['services']
    def changed(container):
        name=container['Config']['Labels']['com.docker.compose.service']
        host=container['HostConfig']; desired=desired_services[name]
        return (host['Memory']!=int(values['deploy.'+name+'.memoryMiB'])*1024**2 or host['NanoCpus']!=round(values['deploy.'+name+'.cpu']*10**9) or
                host['PidsLimit']!=values['deploy.'+name+'.pids'] or host['LogConfig'].get('Config')!=desired['logging']['options'] or
                (name=='database' and container['Config']['Cmd']!=desired['command']))
    changed_services=['database'] if any(c['Config']['Labels']['com.docker.compose.service']=='database' and changed(c) for c in containers) else []
    changed_services+=['api','media']
    nginx = pathlib.Path('/etc/nginx/wanwu')
    proxy_file, route_file = nginx/'wanwu-api-proxy.conf', nginx/'wanwu-api-routes.conf'
    proxy = proxy_file.read_text()
    new_files[proxy_file] = re.sub(r'proxy_connect_timeout \d+s;', 'proxy_connect_timeout '+str(values['proxy.connectSeconds'])+'s;', proxy)
    routes = route_file.read_text()
    def timeout_block(match):
        block = match.group(0)
        key = 'proxy.discoveryReadSeconds' if '/discovery/work' in block else 'proxy.featuresReadSeconds' if '/textbook/features' in block else 'proxy.defaultReadSeconds'
        return re.sub(r'proxy_read_timeout \d+s;', 'proxy_read_timeout '+str(values[key])+'s;', block)
    new_files[route_file] = re.sub(r'location[^{}]+\{[^{}]*\}', timeout_block, routes)
    for name in ['backup', 'cleanup', 'storage', 'health']:
        unit = pathlib.Path('/etc/systemd/system')/('wanwu-'+name+'.timer.d')
        unit.mkdir(mode=0o755, exist_ok=True)
        if name == 'backup':
            schedule = 'OnCalendar=\nOnCalendar=*-*-* %02d:%02d:00 UTC\nRandomizedDelaySec=%ds\n' % ((values['schedule.backupHour']-8)%24,values['schedule.backupMinute'],values['schedule.backupJitterSeconds'])
        else: schedule = 'OnUnitActiveSec=\nOnUnitActiveSec=%dmin\n' % values['schedule.'+name+'Minutes']
        new_files[unit/'site-configuration.conf'] = '[Timer]\n'+schedule
    rollback = pathlib.Path(tempfile.mkdtemp(prefix='before-configuration-', dir=ROOT))
    existing = {}
    for index, path in enumerate(new_files):
        existing[path] = path.exists()
        if path.exists(): shutil.copy2(path, rollback/str(index))
    # Serialize against scheduled maintenance and against concurrent web saves.
    with open(maintenance/'.maintenance.lock','a') as lock:
        os.chmod(lock.name,0o600); fcntl.flock(lock, fcntl.LOCK_EX)
        file_lock = CONFIG/'.write-lock'; file_lock.mkdir(mode=0o700)
        try:
            if json.loads((CONFIG/'config.json').read_text())['revision'] != snapshot['revision']:
                raise RuntimeError('Configuration changed after the plan was built')
            try:
                for path, data in new_files.items(): write(path,data)
                run(command+['config','--quiet'])
                run(['/usr/sbin/nginx','-t'])
                run(command+['up','--detach','--no-deps','--pull','never',*changed_services],timeout=180)
                for attempt in range(30):
                    try: health('http://127.0.0.1:3100/api/v1/health'); break
                    except Exception:
                        if attempt == 29: raise
                        time.sleep(1)
                run(['/usr/sbin/nginx','-s','reload'])
                run(['/usr/bin/systemctl','daemon-reload'])
                run(['/usr/bin/systemctl','restart',*[f'wanwu-{name}.timer' for name in ['backup','cleanup','storage','health']]])
                health('https://proterm.ink/'); health('https://wanwu.proterm.ink/api/v1/health')
                health('https://wanwu.proterm.ink/api/v1/admin/settings/csrf')
                run(['/usr/bin/docker','exec','-w','/app','wanwu-sound-api-1','node','apps/api/src/settings/verify-runtime-cli.ts'],timeout=30)
                actual=json.loads(run(['/usr/bin/docker','inspect','wanwu-sound-api-1','wanwu-sound-media-1','wanwu-sound-database-1']))
                if any(changed(c) for c in actual): raise RuntimeError('Applied container resources do not match the requested values')
                write_signed(CONFIG/'applied.json',{'format':1,'revision':snapshot['revision'],'at':timestamp(),'effective':applied},read_key(ROOT))
                print(json.dumps({'status':'applied','revision':snapshot['revision'],'rollbackDirectory':str(rollback),'existingProjectChanged':False}))
            except Exception:
                for index,path in enumerate(new_files):
                    if existing[path]: shutil.copy2(rollback/str(index),path)
                    elif path.exists(): path.unlink()
                old_command = command
                if not existing[override]:
                    if command[-2:] != ['--file',str(override)]: raise RuntimeError('Rollback Compose path verification failed')
                    old_command = command[:-2]
                run(old_command+['up','--detach','--no-deps','--pull','never',*changed_services],timeout=180)
                run(['/usr/sbin/nginx','-t']); run(['/usr/sbin/nginx','-s','reload'])
                run(['/usr/bin/systemctl','daemon-reload'])
                run(['/usr/bin/systemctl','restart',*[f'wanwu-{name}.timer' for name in ['backup','cleanup','storage','health']]])
                raise RuntimeError('Configuration apply failed; Wanwu-only rollback attempted, values suppressed')
        finally: file_lock.rmdir()

if __name__ == '__main__':
    try: main()
    except Exception as error:
        # All surfaced messages are fixed explanations above, never exception bodies from subprocess/URLs.
        print(json.dumps({'status':'failed','reason':str(error) if isinstance(error,RuntimeError) else 'Wanwu configuration operation failed; private details suppressed'}))
        raise SystemExit(1)
