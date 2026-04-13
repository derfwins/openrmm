FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required by Tactical RMM
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    postgresql-client \
    libpq-dev \
    git \
    curl \
    wget \
    build-essential \
    libssl-dev \
    libffi-dev \
    python3-dev \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libcairo2 \
    shared-mime-info \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for caching
COPY tacticalrmm/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy the entire Django project
COPY tacticalrmm/ /app/

# Add the app directory to Python path so 'tacticalrmm' package is importable
ENV PYTHONPATH=/app:$PYTHONPATH

# Collect static files (will be overridden by volume mount in dev)
RUN python manage.py collectstatic --noinput 2>/dev/null || true

EXPOSE 8000

# Run migrations, create superuser, then start server
CMD ["gunicorn", "tacticalrmm.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120"]