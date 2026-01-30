#!/bin/bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Install SAM 2 (Meta Segment Anything Model 2)
# Since it might not be in PyPI simply as 'sam2' or requires compilation.
# For this MVP, let's assume we clone and install if simple pip fails, 
# or use a known git install.
# Checking if we can install from git directly:
pip install git+https://github.com/facebookresearch/sam2.git

echo "✅ Environment setup complete."
