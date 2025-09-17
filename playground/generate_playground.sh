#!/bin/bash

# FrontEnd - generator-ui composition
nvm use 12
nebulae compose-ui development --shell-type=FUSE_REACT --shell-repo=https://github.com/nebulae-u/generator-ui.git --frontend-id=generator-ui --output-dir=generator-ui  --setup-file=../etc/mfe-setup.json

# API - GateWay composition
nvm use 10
nebulae compose-api development --api-type=NEBULAE_GATEWAY --api-repo=https://github.com/nebulae-u/generator-ui-gateway.git --api-id=generator-ui-gateway --output-dir=generator-ui-gateway  --setup-file=../etc/mapi-setup.json