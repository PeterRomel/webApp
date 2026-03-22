# app/core/logger_config.py
import logging
import sys

def setup_shared_logger(level=logging.INFO):
    """
    Configures and returns a shared logger instance.
    Logs are sent to standard output (Console) so they can be safely 
    managed by systemd (journalctl) in a multi-worker Gunicorn environment.
    """
    logger = logging.getLogger('shared_app_logger')
    
    # Prevent adding handlers multiple times if the function is called repeatedly
    if not logger.handlers:
        logger.setLevel(level)

        # Create a formatter
        formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(name)s - %(funcName)s - %(message)s'
        )

        # Create a stream handler to log to the console (stdout)
        # Using sys.stdout ensures systemd captures it perfectly
        stream_handler = logging.StreamHandler(sys.stdout)
        stream_handler.setLevel(level)
        stream_handler.setFormatter(formatter)

        # Add the handler to the logger
        logger.addHandler(stream_handler)

    return logger

# Setup Logging (No file name needed anymore)
APP_LOGGER = setup_shared_logger(level=logging.DEBUG)