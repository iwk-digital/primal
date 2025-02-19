from flask import Flask, url_for, redirect, render_template, request, session, jsonify
from dotenv import load_dotenv
from app import app

# Serve static files (e.g., HTML, CSS, JS)
@app.route('/')
def index():
    return render_template('index.html') 

if __name__ == '__main__':
    load_dotenv()
    app.run(debug=True, port=5001)
