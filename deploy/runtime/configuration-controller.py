#!/usr/bin/env python3
"""Wanwu-only configuration dispatcher. No HTTP, arbitrary paths, shell or Docker socket exposure."""
import json
import os
import pathlib
import signal
import stat
import subprocess
import tempfile
import time
from controller_codec import read_key, read_signed, timestamp, valid_request, write_signed

ROOT = pathlib.Path('/etc/wanwu-sound')
CONFIG = pathlib.Path('/srv/wudaizii/wanwu-sound/configuration')
JOURNAL = ROOT / '.configuration-controller.json'
stopping = False


def journal(value):
    fd, name = tempfile.mkstemp(prefix='.controller-journal-', dir=ROOT)
    try:
        with os.fdopen(fd, 'w') as file:
            os.fchmod(file.fileno(), 0o600)
            json.dump(value, file)
            file.flush()
            os.fsync(file.fileno())
        os.replace(name, JOURNAL)
    finally:
        if os.path.exists(name): os.unlink(name)


def main():
    if os.geteuid() != 0 or ROOT.is_symlink() or ROOT.stat().st_uid != 0 or ROOT.stat().st_mode & 0o022:
        raise RuntimeError('Protected Wanwu operator directory required')
    info = CONFIG.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 1000 or info.st_mode & 0o077:
        raise RuntimeError('Private Wanwu configuration directory required')
    for name in ['apply-configuration.py', 'controller_codec.py', 'configuration-controller.py']:
        info = (ROOT / name).lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
            raise RuntimeError('Protected fixed Wanwu controller program required')
    key = read_key(ROOT)
    state = {'phase': 'idle', 'requestId': '', 'revision': 0, 'lastStarted': 0, 'message': '配置应用器已就绪'}
    if JOURNAL.exists():
        info = JOURNAL.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
            raise RuntimeError('Protected controller journal required')
        state.update(json.loads(JOURNAL.read_text()))
        if state['phase'] == 'applying':
            state.update(phase='failed', message='上次应用进程被中断。请核对当前生效值后重新申请。')
            journal(state)
    child = None
    started = 0
    while not stopping or child is not None:
        if child is not None:
            code = child.poll()
            if code is None and time.monotonic() - started > 600:
                # The applier has bounded subprocesses and performs its own rollback.
                # Do not kill it mid-rollback; report timeout and keep serializing requests.
                state['message'] = '应用耗时超过预期，正在等待受控操作及回滚结束。'
            if code is not None:
                output,_ = child.communicate()
                receipt = read_signed(CONFIG / 'applied.json', key)
                success = code == 0 and receipt and receipt.get('revision') == state['revision']
                state.update(phase='applied' if success else 'failed', message='配置已应用，当前生效值已更新。' if success else '应用未完成；已尝试保留或恢复原配置。请检查输入、外部依赖及资源余量。')
                messages={
                    'Shared-host memory or disk reserve not met':'共享 ECS 的可用内存或磁盘不足，未应用。',
                    'Requested memory would consume the shared-host reserve':'申请的内存会占用共享 ECS 必须保留的余量，未应用。',
                    'CPU allocation would exceed the shared-host budget':'CPU 配额超过共享 ECS 的预算，未应用。',
                    'Wait for active Wanwu media / model tasks before applying':'有正在执行的媒体或模型任务，请等任务完成后重新应用。',
                    'Wanwu scheduled maintenance is running; try again after it completes':'备份或巡检任务正在执行，请完成后重新应用。',
                    'Storage target or Origin change requires a separately verified migration / DNS-TLS-CORS procedure':'域名或存储目标切换需要先完成迁移、DNS、证书和跨域配置，未应用。',
                    'Changing the database target requires an explicit migration procedure':'数据库目标切换需要先完成迁移，未应用。',
                    'Configuration revision changed before application':'配置版本已经变化，请重新读取并核对后应用。',
                    'Configuration changed after the plan was built':'配置版本已经变化，请重新读取并核对后应用。',
                }
                if not success:
                    for line in output.splitlines():
                        try: detail=json.loads(line)
                        except ValueError: continue
                        if detail.get('status')=='failed' and detail.get('reason') in messages:
                            state['message']=messages[detail['reason']]
                journal(state)
                child = None
        if child is None and not stopping:
            request = read_signed(CONFIG / 'apply-request.json', key)
            if request and request.get('id') != state['requestId'] and valid_request(request, time.time()):
                receipt = read_signed(CONFIG / 'applied.json', key)
                interval = (receipt or {}).get('effective', {}).get('deploy.applyIntervalSeconds', 60)
                if type(interval) is not int or not 10 <= interval <= 3600: interval = 60
                state.update(requestId=request['id'], revision=request['revision'])
                if time.time() - state['lastStarted'] < interval:
                    state.update(phase='failed', message='配置应用过于频繁，请等待最小应用间隔后重试。')
                    journal(state)
                else:
                    state.update(phase='applying', lastStarted=time.time(), message='正在检查资源、活动任务及配置；只应用万物声谱。')
                    journal(state)
                    child = subprocess.Popen(['/usr/bin/python3', str(ROOT / 'apply-configuration.py'), '--apply', '--expected-revision', str(request['revision'])], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin'})
                    started = time.monotonic()
        write_signed(CONFIG / 'controller-status.json', {'format': 1, 'at': timestamp(), **state}, key)
        time.sleep(2 if child is not None else 5)


def stop(_signum, _frame):
    global stopping
    stopping = True


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        main()
    except Exception:
        print('Wanwu configuration controller stopped; private details suppressed.', flush=True)
        raise SystemExit(1)
