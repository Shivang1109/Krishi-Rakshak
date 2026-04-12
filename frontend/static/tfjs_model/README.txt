Place TensorFlow.js converted model here after exporting from your Keras model:

  tensorflowjs_converter --input_format=keras ../best_model.keras ./

Expected files: model.json and *.bin weight shards.

Preprocessing in detect.js matches MobileNetV2 Keras: resize 224×224, normalize x/127.5 - 1.

Until this folder contains a valid model.json, offline TFJS inference on detect.html will fall back to online /predict only.
