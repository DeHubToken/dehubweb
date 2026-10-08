FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 HF_HOME=/home/user/.cache/huggingface DUB_CPU_THREADS=2

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg libsndfile1 git \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install --no-cache-dir -r requirements.txt

COPY handler.py server.py ./
USER user
EXPOSE 7860
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
