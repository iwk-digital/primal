from flask import Flask, send_from_directory, url_for, redirect, render_template, request, session, jsonify
from dotenv import load_dotenv
from app import app
import mimetypes

mimetypes.add_type('application/ld+json', '.jsonld')
mimetypes.add_type('text/turtle', '.ttl')
mimetypes.add_type('appliction/xml', '.mei')

# Serve static web files (e.g., HTML, CSS, JS)
@app.route('/')
def index():
    return render_template('index.html') 

# Serve static test data (e.g., MEI, JSONLD)
@app.route('/static/test/<path:filename>')
def static_test(filename):
    print("HEEEEREREEEEE", filename)
    # Check if the file exists and is a valid MIME type
    mimetype = mimetypes.guess_type(filename)[0]
    if mimetype is None:
        return jsonify({"error": "File type not supported"}), 400
    print("Mimetype: ", mimetype)
    # Serve the file
    return send_from_directory('static/test/', filename, mimetype=mimetype)

if __name__ == '__main__':
    load_dotenv()
    app.run(debug=True, port=5001)
