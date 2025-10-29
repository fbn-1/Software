from xbbg import blp
import psycopg2
import blpapi
from datetime import datetime

# ---------- CONFIG ----------
TICKERS = ['AAPL US Equity', 'MSFT US Equity', 'GOOG US Equity']
DB_CONFIG = {
    'host': 'localhost',
    'dbname': 'myappdb',
    'user': 'postgres',
    'password': 'yourpassword'
}
FIELDS = ['BEST_EPS', 'BEST_SALES', 'BEST_NET_INCOME']
# ----------------------------

def fetch_earnings(tickers, fields):
    """
    Fetch earnings data from Bloomberg.
    """
    data = blp.bdp(tickers, flds=fields)
    return data


def store_earnings_postgres(data):
    """
    Insert or update earnings in PostgreSQL.
    """
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    for ticker, row in data.iterrows():
        cur.execute("""
            INSERT INTO earnings (ticker, eps, sales, net_income, last_updated)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (ticker) DO UPDATE
            SET eps = EXCLUDED.eps,
                sales = EXCLUDED.sales,
                net_income = EXCLUDED.net_income,
                last_updated = EXCLUDED.last_updated
        """, (
            ticker,
            row.get('BEST_EPS'),
            row.get('BEST_SALES'),
            row.get('BEST_NET_INCOME'),
            datetime.now()
        ))

    conn.commit()
    cur.close()
    conn.close()
    print("Earnings data stored successfully.")


if __name__ == "__main__":
    print("Fetching Bloomberg earnings...")
    data = fetch_earnings(TICKERS, FIELDS)
    print(data)
    store_earnings_postgres(data)
