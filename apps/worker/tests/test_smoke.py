import genie_worker


def test_package_has_entry_point():
    assert callable(genie_worker.main)
