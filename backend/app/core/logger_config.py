# logger_config.py
import logging
import os

def setup_shared_logger(log_file_name='app.log', level=logging.INFO):
    """
    Configures and returns a shared logger instance.
    """
    logger = logging.getLogger('shared_app_logger')
    # Prevent adding handlers multiple times if the function is called repeatedly
    if not logger.handlers:
        logger.setLevel(level)

        # Create file handler
        file_handler = logging.FileHandler(log_file_name, mode='a') # Use 'a' for append mode
        file_handler.setLevel(level)

        # Create a formatter
        formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s')
        file_handler.setFormatter(formatter)

        # Add the handler to the logger
        logger.addHandler(file_handler)
        
        # Optional: Add a stream handler to also log to the console
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

    return logger

# Setup Logging
APP_LOGGER = setup_shared_logger(log_file_name="application.log", level=logging.DEBUG)