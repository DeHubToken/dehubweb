FROM python:3.11-slim

# medium won the benchmark in the README; build with --build-arg to try another.
ARG WHISPER_MODEL=medium
# 1 adds the CUDA 12 / cuDNN 9 user-space libraries for a GPU host (RunPod).
ARG GPU=0
ENV PYTHONUNBUFFERED=1 HF_HOME=/models/hf WHISPER_MODELS_DIR=/models WHISPER_MODEL=${WHISPER_MODEL}

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg curl bzip2 ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && if [ "$GPU" = "1" ]; then pip install --no-cache-dir nvidia-cublas-cu12 'nvidia-cudnn-cu12==9.*'; fi
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib:/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib

# Weights ship inside the image, so a cold start never waits on a download and
# the worker needs no outbound access beyond the media it is handed.
RUN mkdir -p /models \
 && curl -fsSL https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2 | tar -xj -C /models \
 && curl -fsSL -o /models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx \
      https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx \
 && python -c "import os; from faster_whisper import download_model; download_model(os.environ['WHISPER_MODEL'], cache_dir='/models/hf/hub')" \
 && chown -R user /models
ENV HF_HUB_OFFLINE=1

COPY engine.py handler.py server.py ./
USER user
EXPOSE 7860
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "7860", "--workers", "1"]
