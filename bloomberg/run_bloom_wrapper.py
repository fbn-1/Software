import runpy
import traceback

try:
    runpy.run_path(r'c:\Software1\bloomberg\bloom.py', run_name='__main__')
except Exception:
    traceback.print_exc()
    raise
