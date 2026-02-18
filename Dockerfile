# Backend Dockerfile
FROM node:20-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg python3 py3-pip

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directories for uploads and chunks
RUN mkdir -p uploads audio_chunks chunks

EXPOSE 5000

CMD ["npm", "start"]
