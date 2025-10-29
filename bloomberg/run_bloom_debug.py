import sys
import time
import traceback
from pathlib import Path

# Ensure the bloom.py directory is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import bloom
    print("Imported bloom module OK")
    print("Module attributes:", [a for a in dir(bloom) if not a.startswith('_')])
except Exception:
    print("Failed to import bloom.py")
    traceback.print_exc()
    raise

# Call fetch_earnings only (avoid DB writes)
try:
    print("Calling fetch_earnings with tickers:", bloom.TICKERS)
    # If Bloomberg isn't available, stub bloom.blp.bdp to return a small pandas DataFrame
    try:
        import pandas as pd
        def _stub_bdp(tickers, flds=None):
            # create a simple DataFrame with tickers as index and fields as columns
            cols = flds or ['VALUE']
            data = {c: [1.23 for _ in tickers] for c in cols}
            df = pd.DataFrame(data, index=tickers)
            return df

        # Apply stub only if real call would hang or fail
        if not hasattr(bloom.blp, 'bdp') or callable(getattr(bloom.blp, 'bdp')):
            bloom.blp.bdp = _stub_bdp

    except Exception:
        print("Could not setup stub for bloom.blp.bdp; proceeding without it")

    t0 = time.time()
    data = bloom.fetch_earnings(bloom.TICKERS, bloom.FIELDS)
    t1 = time.time()
    print(f"fetch_earnings completed in {t1-t0:.2f}s")
    print("Returned type:", type(data))
    try:
        print(data)
    except Exception:
        print("Could not print data; repr:", repr(data))
except Exception:
    print("fetch_earnings raised an exception:")
    traceback.print_exc()

print("Debug runner finished")
